var gStage = 0;

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
      var obj = readCsvContent(params);
      postMessage(obj);
      break;
    case 2:
      var obj = createAllQueries(params);
      postMessage(obj);
      break;
    }
  }
};

function readCsvContent(csvParams) {
  tempStore.csvParams = csvParams;

  var sData = readFile(csvParams.file, csvParams.charset);
  postMessage('Read csv file: ' + sData.length + ' bytes');
	tempStore.csvRecords = CsvToArray(sData, csvParams.separator);

	var iRows = tempStore.csvRecords.length;
  postMessage('Parsed csv data: ' + iRows + ' records');

	if (iRows <= 0) {
	  var obj = {stage: gStage, success: 0, description: 'no rows found'};		return obj;  }

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

function readFile(file, charset) {
  var req = new XMLHttpRequest();
  req.open('GET', file, false);
  req.overrideMimeType('text/plain; charset='+charset);
  req.send(null);
  if(req.status == 0)
    return req.responseText;
}

//When there are 2 consecutive separators (,,) or a separator at the start of a line (^,) we treat them as having a null field in between. If separator is followed by newline (,\n) the treatment depends upon user option whether to ignore trailing commas. If not ignored, a null field is assumed after the trailing delimiter. However, lines which have no character in them (^\n) are ignored instead of the possible alternative of treating them as representative of a single null field. See Issue #324 too.
function CsvToArray(input, separator) {
  var re_linebreak = /[\n\r]+/

  var re_token = /[\"]([^\"]|(\"\"))*[\"]|[,]|[\n\r]|[^,\n\r]*|./g
  if (separator == ";")
    re_token = /[\"]([^\"]|(\"\"))*[\"]|[;]|[\n\r]|[^;\n\r]*|./g
  if (separator == "|")
    re_token = /[\"]([^\"]|(\"\"))*[\"]|[|]|[\n\r]|[^|\n\r]*|./g
  if (separator == "\t")
    re_token = /[\"]([^\"]|(\"\"))*[\"]|[\t]|[\n\r]|[^\t\n\r]*|./g

  //TODO: try using exec in a loop
  var a = input.match(re_token);

  var token;
  var line = [], allLines = [];
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
        allLines.push(line);
    	  postMessage('Parsing csv data: ' + allLines.length + ' records');
        line = [];
      }
    }
    else { //field value
      tk = tkNORMAL;
      if (tkp != tkSEPARATOR) {
        if (line.length > 0) {
          allLines.push(line);
      	  postMessage('Parsing csv data: ' + allLines.length + ' records');
          line = [];
        }
      }
      //remove quotes from both ends
      if (token.length >= 2) {
        var firstChar = token[0];
        if (firstChar == '"' || firstChar == "'") {
          if (token[token.length - 1] == firstChar) {
            token = token.substring(1, token.length - 1);
          }
        }
      }
      line.push(token);
    }
  }

  return allLines;
}

//http://www.bennadel.com/blog/1504-Ask-Ben-Parsing-CSV-Strings-With-Javascript-Exec-Regular-Expression-Command.htm
function CsvToArray1(strData, strDelimiter) {
	// Check to see if the delimiter is defined. If not,
	// then default to comma.
	strDelimiter = (strDelimiter || ",");

	// Create a regular expression to parse the CSV values.
	var objPattern = new RegExp(
		(	// Delimiters.
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

