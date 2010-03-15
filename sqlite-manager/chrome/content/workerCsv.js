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
    if(req.status == 0) {
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
        var obj = processCsvData(2); //1 for original, 2 for new reader
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
  if (whichReader == 1)
    CsvToArray(tempStore.csvParams.separator);
  if (whichReader == 2)
    CsvToArrayMM(tempStore.csvParams.separator);

  gFile.init();

  var iRows = tempStore.csvRecords.length;
  postMessage('Parsed csv data: ' + iRows + ' records');

  if (iRows <= 0) {
    var obj = {stage: gStage, success: 0, description: 'no rows found'};    return obj;  }

  tempStore.columns = [];
  var aVals = tempStore.csvRecords[0];
  if (tempStore.csvParams.bColNames) {
    //first row contains column names
    tempStore.columns = aVals;
    //if col names are enclosed in quotes, remove them from both ends
    for (var c = 0; c < tempStore.columns.length; c++) {
      if (tempStore.columns[c][0] == "'" ||
        tempStore.columns[c][0] == '"') {
        var len = tempStore.columns[c].length;
        tempStore.columns[c] = tempStore.columns[c].substring(1, len - 1);
      }
    }
  }
  else {
    for (var c = 1; c <= aVals.length; c++)
      tempStore.columns.push("col_" + c);
  }

  var obj = {stage: gStage, success: 1, description: '', tableName: tempStore.csvParams.tableName, columns: tempStore.columns};
  return obj;
}

function createAllQueries(params) {
  var aQueries = [];
  var iOtherQueries = 0;
  if (params.createTableQuery != "") {
    aQueries.push(params.createTableQuery);
    iOtherQueries = 1;
  }

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
      if (aVals[c] == null)
        aVals[c] = "null";

      //quote, if not already within quotes
      if (!(aVals[c].length > 0 && (aVals[c][0] == "'" || aVals[c][0] == '"'))) {
        aVals[c] = "'" + aVals[c] + "'";
      }

      aInp.push(aVals[c]);
    }
    
    //if aInp has fewer values than expected, 
    //complete the aInp array with empty strings.
    while (aInp.length < iCols)
      aInp.push(sNoValue);

    //aBadLines will not be empty only if their are more values than columns
    if (aInp.length != iCols) {
      aBadLines.push(i+1);
      continue;
    }
    sVals = " VALUES (" + aInp.join(",") + ")";
    sQuery = "INSERT INTO " + params.tableName + sVals;
    aQueries.push(sQuery);
    postMessage('Creating SQL statements: ' + aQueries.length + ' created');
  }
  var num = aQueries.length - iOtherQueries;
  var obj = {stage: gStage, success: 1, description: '', numRecords: num, queries: aQueries, badLines: aBadLines};
  return obj;}

//If separator is followed by newline (,\n) the treatment depends upon user option whether to ignore trailing commas. If not ignored, a null field is assumed after the trailing delimiter. However, lines which have no character in them (^\n) are ignored instead of the possible alternative of treating them as representative of a single null field. See Issue #324 too.
function CsvToArrayMM(separator) {
  //check whether tab is handled correctly as a separator

  tempStore.csvRecords = [];
  var token;
  var line = [];
  var tkSEPARATOR = 0, tkNEWLINE = 1, tkNORMAL = 2;
  var tk = tkNEWLINE, tkp = tkNEWLINE;
  var c;
  var iStart = 0, iEnd = 0;
  var i = -1;
  while (true) {
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
      if (line.length == 0 || tkp == tkSEPARATOR) {        line.push(null);
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

//    case "x":
//    case "X":
//      var iStart = i, iEnd = i;
//      
//      break;

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
      line.push(token);
      break;
    }
  }
}

//When there are 2 consecutive separators (,,) or a separator at the start of a line (^,) we treat them as having a null field in between. If separator is followed by newline (,\n) the treatment depends upon user option whether to ignore trailing commas. If not ignored, a null field is assumed after the trailing delimiter. However, lines which have no character in them (^\n) are ignored instead of the possible alternative of treating them as representative of a single null field. See Issue #324 too.
function CsvToArray(separator) {
  var re_linebreak = /[\n\r]+/

  var re_token = /[\"]([^\"]|(\"\"))*[\"]|[,]|[\n\r]|[^,\n\r]*|./g
  if (separator == ";")
    re_token = /[\"]([^\"]|(\"\"))*[\"]|[;]|[\n\r]|[^;\n\r]*|./g
  if (separator == "|")
    re_token = /[\"]([^\"]|(\"\"))*[\"]|[|]|[\n\r]|[^|\n\r]*|./g
  if (separator == "\t")
    re_token = /[\"]([^\"]|(\"\"))*[\"]|[\t]|[\n\r]|[^\t\n\r]*|./g

  var input = gFile.contents;
  //TODO: try using exec in a loop
  var a = input.match(re_token);

  var token;
  var line = [];
  tempStore.csvRecords = [];
  var tkSEPARATOR = 0, tkNEWLINE = 1, tkNORMAL = 2;
  var tk = tkNEWLINE, tkp = tkNEWLINE;

  for (var i = 0; i < a.length; i++) {
    tkp = tk;

    token = a[i];
    
    if (token == separator) {
      tk = tkSEPARATOR;
      //this separator is the first char in line or follows another separator
      if (line.length == 0 || tkp == tkSEPARATOR) {
        line.push(null);
      }
    }
    else if (token == "\n" || token == "\r") {
      tk = tkNEWLINE;
      if (!tempStore.csvParams.ignoreTrailingDelimiter && tkp == tkSEPARATOR) {
        line.push(null);
      }
      if (line.length > 0) {
        tempStore.csvRecords.push(line);
        postMessage('Parsing csv data: ' + tempStore.csvRecords.length + ' records');
        line = [];
      }
    }
    else { //field value
      tk = tkNORMAL;
      if (tkp != tkSEPARATOR) {
        if (line.length > 0) {
          tempStore.csvRecords.push(line);
          postMessage('Parsing csv data: ' + tempStore.csvRecords.length + ' records');
          line = [];
        }
      }
      //remove quotes from both ends
      if (token.length >= 2) {
        var firstChar = token[0];
        if (firstChar == '"' || firstChar == "'") {
          if (token[token.length - 1] == firstChar) {
            token = token.substring(1, token.length - 1);
            if (firstChar == '"')
              token = token.replace(new RegExp("\"\"", "g" ), "\"");
            if (firstChar == "'")
              token = token.replace(new RegExp("\'\'", "g" ), "\'");
          }
        }
      }
      line.push(token);
    }
  }
}

//called only
function quote(str) {
  if (typeof str == "string") {
    for (var i = 0; i < str.length; i++) {
      str = str.replace("'", "''", "g");
    }
  }
  return "'" + str + "'";
}

