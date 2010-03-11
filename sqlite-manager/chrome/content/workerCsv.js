var gStage = 0;

var gFile = {
  contents: null,
  packetSize: 10000,
  currPosition: 0,

  init: function() {
    this.contents = null;
    this.currPosition = 0;
  },

  read: function(file, charset) {
    var req = new XMLHttpRequest();
    req.open('GET', file, false);
    req.overrideMimeType('text/plain; charset='+charset);
    req.send(null);
    if(req.status == 0)
      this.contents = req.responseText;
  }

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
  if (csvParams.bColNames) {
    for (var c = 0; c < aVals.length; c++) {
      tempStore.columns.push(aVals[c]);
    }
  }
  else {
    for (var c = 1; c <= aVals.length; c++)
      tempStore.columns.push("col_" + c);
  }

  var obj = {stage: gStage, success: 1, description: '', tableName: csvParams.tableName, columns: tempStore.columns};
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

  for (var i = bColNames?1:0; i < iRows; i++) {
    var aVals = tempStore.csvRecords[i];

    var iCol = 0;
    var aInp = [];
    var aBadLines = [];
    var sNoValue = "''";
    for (var c = 0; c < aVals.length; c++) {
      if (aVals[c] != null)
        aVals[c] = quote(aVals[c]);
      else
        aVals[c] = "null";

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

//When there are 2 consecutive separators (,,) or a separator at the start of a line (^,) we treat them as having a null field in between. If separator is followed by newline (,\n) the treatment depends upon user option whether to ignore trailing commas. If not ignored, a null field is assumed after the trailing delimiter. However, lines which have no character in them (^\n) are ignored instead of the possible alternative of treating them as representative of a single null field. See Issue #324 too.
function CsvToArrayMM(separator) {
  var re_linebreak = /[\n\r]+/

  var re_token = /[\"]([^\"]|(\"\"))*[\"]|[,]|[\n\r]|[^,\n\r]*|./g
  if (separator == ";")
    re_token = /[\"]([^\"]|(\"\"))*[\"]|[;]|[\n\r]|[^;\n\r]*|./g
  if (separator == "|")
    re_token = /[\"]([^\"]|(\"\"))*[\"]|[|]|[\n\r]|[^|\n\r]*|./g
  if (separator == "\t")
    re_token = /[\"]([^\"]|(\"\"))*[\"]|[\t]|[\n\r]|[^\t\n\r]*|./g

  //check tab handling here
  var reDelimiters = new RegExp("[\n\r" + separator + "]");
/*
  1. if we have no data to process, getMoreData else goto 2.
  2. match with regex
  3. accept all matches except the last match
  4. does the last match begin with quotes
  5. if answer to 4 is yes, getMoreData and join to last match until we have the corresponding quote closed. It may happen that quote closed found at the end is not the right one owing to next character being the same quote (i.e. the quote is escaped) which we can know only when we getMoreData
  6. continue 5 until eof or closing quote is found
  7. after the closing quote is found, take the remaining string and goto 1.
  8. if answer to 4 is no, getMoreData and join to last match until we have the separator or \n or \r
*/
  tempStore.csvRecords = [];
  var token, sData, lastMatch = null, bEOF = false, noOfQuotesAtEnd = 0;
  var line = [];
  var aMoreData = [];
  var tkSEPARATOR = 0, tkNEWLINE = 1, tkNORMAL = 2;
  var tk = tkNEWLINE, tkp = tkNEWLINE;
  var input = "", sMoreData = null;
  while (true) {
    //time to get more data
    if (!bEOF) {
      aMoreData = gFile.getMoreData();
      bEOF = aMoreData[1];
      sData = aMoreData[0];
    }
    else
      return;

      input = sData;
      //handle any remnant string from the last cycle of match
      if (lastMatch != null) {
        //lastMatch += sData;
        var firstChar = lastMatch[0];
        if (firstChar == '"' || firstChar == "'") {
          sData += noOfQuotesAtEnd
          var prefix = "";
          for (var i = 0; i < noOfQuotesAtEnd; i++) {
            prefix += firstChar;
          }
          sData = prefix + sData;
          var bQuoteEnd = false;
          for (var i = 0; i < sData.length; i++) {
            if (sData[i] != firstChar && bQuoteEnd) {//found the end
              lastMatch += sData.substring(0, i);
              line.push(lastMatch);
              //then, process the remaining substring
              input = sData.substring(i);
              break;   
            }
            if (sData[i] == firstChar)
              bQuoteEnd = !bQuoteEnd;
            else
              bQuoteEnd = false;
          }
          //we reach here if end not found
          if (bQuoteEnd) {//ending is a quote
            noOfQuotesAtEnd = 1;
            lastMatch += sData
          }
          lastMatch += sData;
          if (!bEOF) {//check this condition; it is wrong
            line.push(lastMatch);
            continue;
          }
        }
        else {
          //find the first separator, \n, \r
          var arr = reDelimiters.exec(sData);
          var iPos = sData.length;
          if (arr != null) {
            //if found, append the substring until it to lastMatch
            iPos = arr.index;
            lastMatch += sData.substring(0, iPos);
            line.push(lastMatch);
            //then, process the remaining substring
            input = sData.substring(iPos);
          }
          else {
            lastMatch += sData;
            if (!bEOF) {//check this condition; it is wrong
              line.push(lastMatch);
              continue;
            }
          }
        } 
      }

    var a = input.match(re_token);

    for (var i = 0; i < a.length; i++) {
      lastMatch = null;
      tkp = tk;

      token = a[i];

      if (token == separator) {
        tk = tkSEPARATOR;
        //this separator is the first char in line or follows another separator
        if (line.length == 0 || tkp == tkSEPARATOR) {          line.push(null);
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
        noOfQuotesAtEnd = 0;
        //add this token to line only if it is not the last match
        if ((a.length != i + 1) || bEOF) {
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
        else {
          var firstChar = token[0];
          if (firstChar == '"' || firstChar == "'") {
            for (var iEnd = token.length - 1; iEnd >= 0; iEnd--)
              if (token[iEnd] == firstChar)
                noOfQuotesAtEnd++;
          }
          lastMatch = token.substring(0, token.length - iEnd);
        }
      }
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

//http://www.bennadel.com/blog/1504-Ask-Ben-Parsing-CSV-Strings-With-Javascript-Exec-Regular-Expression-Command.htm
function CsvToArray1(strData, strDelimiter) {
  // Check to see if the delimiter is defined. If not,
  // then default to comma.
  strDelimiter = (strDelimiter || ",");

  // Create a regular expression to parse the CSV values.
  var objPattern = new RegExp(
    (  // Delimiters.
      "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +
      // Quoted fields.
      "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
      // Standard fields.
      "([^\"\\" + strDelimiter + "\\r\\n]*))"
    ), "gi");

  // Create an array to hold our data. Give the array
  // a default empty first row.
  var arrData = [[]];

  // Create an array to hold our individual pattern
  // matching groups.
  var arrMatches = null;

  // Keep looping over the regular expression matches
  // until we can no longer find a match.
  while (arrMatches = objPattern.exec(strData)) {

    // Get the delimiter that was found.
    var strMatchedDelimiter = arrMatches[1];
     postMessage('delim: ' + arrData.length + ':' + strMatchedDelimiter);

    // Check to see if the given delimiter has a length
    // (is not the start of string) and if it matches
    // field delimiter. If id does not, then we know
    // that this delimiter is a row delimiter.
    if (strMatchedDelimiter.length &&
      (strMatchedDelimiter != strDelimiter)) {

      // Since we have reached a new row of data,
      // add an empty row to our data array.
      arrData.push([]);
      postMessage('Parsing csv data: ' + arrData.length + ' records');
    }

    // Now that we have our delimiter out of the way,
    // let's check to see which kind of value we
    // captured (quoted or unquoted).
    if (arrMatches[2]) {

      // We found a quoted value. When we capture
      // this value, unescape any double quotes.
      var strMatchedValue = arrMatches[2].replace(
        new RegExp("\"\"", "g" ), "\"");
     postMessage('value q: ' + arrData.length + ':' + strMatchedValue);
    }
    else {

      // We found a non-quoted value.
      var strMatchedValue = arrMatches[3];
     postMessage('value nq: ' + arrData.length + ':' + strMatchedValue);

      //next two lines by mkt to distinguish null from strings
      if (strMatchedValue == undefined || strMatchedValue == null)
        strMatchedValue = null;
      else
      if (strMatchedValue.length == 0)
        strMatchedValue = null;
    }

    // Now that we have our value string, let's add
    // it to the data array.
    arrData[arrData.length - 1].push(strMatchedValue);
     postMessage('value: ' + arrData.length + ':' + strMatchedValue);
  }

  // Return the parsed data.
  return arrData;
}

function quote(str) {
  if (typeof str == "string")
    str = str.replace("'", "''", "g");
  return "'" + str + "'";
}

