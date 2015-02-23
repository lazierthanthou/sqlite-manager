var gStage = 0;

var gFile = {
  contents: null,
  size: 0,
  packetSize: 100,
  currPosition: 0,

  init: function() {
    this.contents = null;
    this.size = 0;
    this.currPosition = 0;
  },

  read: function(file, charset) {
    var req = new XMLHttpRequest();
    req.open('GET', file, false);
    req.overrideMimeType('text/plain; charset='+charset);
    req.send(null);
    if(req.status == 0 || req.status == 200) {
      this.contents = req.responseText;
      this.size = this.contents.length;
    }
  },

  getMoreData: function() {
    var str = this.contents.substr(this.currPosition, this.packetSize);
    this.currPosition += this.packetSize;

    //return the string and boolean indicating that there is no more data
    return [str, this.currPosition >= this.contents.length];
  }
};

var tempStore = {
  csvParams: null,
  csvRecords: null,
  csvBlobInfo: null,
  columns: [],
  queries: []
};

onmessage = function(event) {
  if (event.data) {
    var params = event.data;
    gStage = params.stage;
    postMessage('Processing csv import stage ' + gStage);
    switch (gStage) {
      case 1:
        tempStore.csvParams = params;
        gFile.read(params.file, params.charset);
        postMessage('Read csv file: ' + gFile.contents.length + ' bytes');
        var obj = processCsvData();
        postMessage(obj);
        break;

      case 2:
        var obj = createAllQueries(params);
        postMessage(obj);
        break;
    }
  }
};

function processCsvData(whichReader) {
  csvToArray(tempStore.csvParams.separator);

  gFile.init();

  var iRows = tempStore.csvRecords.length;
  postMessage('Parsed csv data: ' + iRows + ' records');

  if (iRows <= 0) {
    var obj = {stage: gStage, success: 0, description: 'no rows found'};
    return obj;
  }

  tempStore.columns = [];
  if (tempStore.csvParams.bColNames) {
    //first row contains column names
    tempStore.columns = tempStore.csvRecords[0];
    //if col names are enclosed in quotes, remove them from both ends
    for (var c = 0; c < tempStore.columns.length; c++) {
      if (tempStore.columns[c] == null) {
        var msg = 'Column no. ' + (c + 1) + ' should have a name.';
        var obj = {stage: gStage, success: 0, description: msg};
        return obj;
      }
      tempStore.columns[c] = tempStore.columns[c].trim();
      if (tempStore.columns[c][0] == "'" ||
        tempStore.columns[c][0] == '"') {
        var len = tempStore.columns[c].length;
        tempStore.columns[c] = tempStore.columns[c].substring(1, len - 1);
        if (tempStore.columns[c].trim() == "") {
          var msg = 'Column no. ' + (c + 1) + ' should have a name.';
          var obj = {stage: gStage, success: 0, description: msg};
          return obj;
        }
      }
    }
  }
  else {
    var aVals = tempStore.csvRecords[0];
    for (var c = 1; c <= aVals.length; c++)
      tempStore.columns.push("col_" + c);
  }

  var obj = {stage: gStage, success: 1, description: '', tableName: tempStore.csvParams.tableName, columns: tempStore.columns};
  return obj;
}

function createAllQueries(params) {
  var aQueries = [];
  var iOtherQueries = 0;
  var sCreateTableQuery = params.createTableQuery;

  var iRows = tempStore.csvRecords.length;
  var iCols = tempStore.columns.length;
  var bColNames = tempStore.csvParams.bColNames;

  var sQuery = "";
  var aBadLines = [];
  var sNoValue = "''";

  for (var i = bColNames?1:0; i < iRows; i++) {
    var aVals = tempStore.csvRecords[i];

    var aInp = [];
    for (var c = 0; c < aVals.length; c++) {
      try {
        if (aVals[c] == null) {
          aVals[c] = "null";
        }
        else {
          //quote the value only if it is not a blob
          if (tempStore.csvBlobInfo.indexOf(i + "x" + c) < 0) {
            //encloser = E means csv from excel (field is enclosed in double quotes only if it contains double quotes or separator; single quotes will be in file like any other char; so enclose in double quotes); to be used for files like the one in Issue #460
            if (tempStore.csvParams.encloser == 'E') {
              if (!(aVals[c].length > 0 && aVals[c][0] == '"' && aVals[c][0] == aVals[c][aVals[c].length - 1])) {
                aVals[c] = '"' + aVals[c] + '"';
              }
            }
            //encloser = N means there is no enclosing character
            else if (tempStore.csvParams.encloser == 'N') {
              aVals[c] = singleQuote(aVals[c]);
            }
            //quote the value if it is not already within quotes
            else if (!(aVals[c].length > 0 && (aVals[c][0] == "'" || aVals[c][0] == '"') && aVals[c][0] == aVals[c][aVals[c].length - 1])) {
              aVals[c] = singleQuote(aVals[c]);
            }
          }
        }
      }
      catch (e) {
        //TODO: some message here
      }
      aInp.push(aVals[c]);
    }

    //if aInp has fewer values than expected, 
    //complete the aInp array with empty strings.
    while (aInp.length < iCols)
      aInp.push(sNoValue);

    //aBadLines will not be empty only if there are more values than columns
    if (aInp.length != iCols) {
      aBadLines.push(i+1);
      continue;
    }
    sVals = " VALUES (" + aInp.join(",") + ")";

    var sCols = "";
    //Issue #255: use column names when importing into an existing table
    //we are importing into an existing table if sCreateTableQuery == ""
    //column names are in first row if tempStore.csvParams.bColNames == true
    //in that case, columns are listed in tempStore.columns
    if (sCreateTableQuery == "" && tempStore.csvParams.bColNames) {
      var aUsedCols = [];
      for (var c = 0; c < tempStore.columns.length; c++) {
        aUsedCols.push('"' + tempStore.columns[c] + '"');
      }
      sCols = " (" + aUsedCols.join(",") + ") ";
    }

    sQuery = "INSERT INTO " + params.tableName + sCols + sVals;
    aQueries.push(sQuery);
    postMessage('Creating SQL statements: ' + aQueries.length + ' created');
    /*
    //for transferring queries to master to give the master an opportunity to work with them while creation of queries is on.
    if (aQueries.length >= 10) {
      postMessage(stage: 2.5, aQueries: aQueries);
      aQueries = [];
    }
    */
  }

  var obj = {stage: gStage, success: 1, description: '', numRecords: aQueries.length, queries: aQueries, badLines: aBadLines, createTableQuery: sCreateTableQuery};
  return obj;
}

//If separator is followed by newline (,\n) the treatment depends upon user option whether to ignore trailing commas. If not ignored, a null field is assumed after the trailing delimiter. However, lines which have no character in them (^\n) are ignored instead of the possible alternative of treating them as representative of a single null field. See Issue #324 too.
function csvToArray(separator) {
  //check whether tab is handled correctly as a separator

  tempStore.csvRecords = [];
  tempStore.csvBlobInfo = [];
  var token;
  var line = [];
  var tkSEPARATOR = 0, tkNEWLINE = 1, tkNORMAL = 2;
  var tk = tkNEWLINE, tkp = tkNEWLINE;
  var c;
  var iStart = 0, iEnd = 0;
  var i = -1;
  while (true) {
    tkp = tk;
    i++;
    if (i >= gFile.size) {
      if (line.length > 0) {
        tempStore.csvRecords.push(line);
        postMessage('Parsing csv data: ' + tempStore.csvRecords.length + ' records');
        line = [];
        
      }
      break; //exit the while loop
    }

    switch (gFile.contents[i]) {
    case separator:
      tk = tkSEPARATOR;
      //this separator is the first char in line or follows another separator. When there are 2 consecutive separators (,,) or a separator at the start of a line (^,) we assume a null field there.
      if (line.length == 0 || tkp == tkSEPARATOR) {
        line.push(null);
      }
      break;

    case "\n":
    case "\r":
      tk = tkNEWLINE;
      if (!tempStore.csvParams.ignoreTrailingDelimiter && tkp == tkSEPARATOR) {
        line.push(null);
      }
      if (line.length > 0) {
        tempStore.csvRecords.push(line);
        postMessage('Parsing csv data: ' + tempStore.csvRecords.length + ' records');
        line = [];
      }
      break;

    case "'":
    case '"':
      tk = tkNORMAL;
      iStart = i;
//      token = "";
      var firstChar = gFile.contents[i];
      i++;
      for (; i < gFile.size; i++) {
        c = gFile.contents[i];
        if (c == firstChar) {
          if (gFile.contents[i + 1] == firstChar) {
//            token += firstChar;
            i++;
          }
          else {
            break;
          }
        }
        else {
//          token += c;
        }
      }
      iEnd = i;
      token = gFile.contents.substring(iStart, iEnd+1);
      line.push(token);
      break;

    default:
      tk = tkNORMAL;
      iStart = i;

      i++;
      for (; i < gFile.size; i++) {
        c = gFile.contents[i];
        if (c == separator || c == "\n" || c == "\r") {
          i--;
          break;
        }
      }
      iEnd = i;
      token = gFile.contents.substring(iStart, iEnd+1);

      try {
        if ((gFile.contents[iStart] == 'x' || gFile.contents[iStart] == 'X')
            && gFile.contents[iStart + 1] == "'"
            && gFile.contents[iEnd] == "'") {
          tempStore.csvBlobInfo.push(tempStore.csvRecords.length + "x" + line.length);
        }
      }
      catch (e) {
      }

      line.push(token);
      break;
    }
  }
}

function singleQuote(sText) {
  var sReturn = "'";
  for (var i = 0; i < sText.length; i++) {
    sReturn += sText[i];
    if (sText[i] == "'")
      sReturn += sText[i];
  }
  sReturn += "'";
  return sReturn;
}
