var xxyyzz = "file:///home/user/sqlite-manager/testdata/";
var csvFiles = [];
csvFiles.push(
  //Use column names when importing from CSV if column names are first row
  //this is for importing into an existing table
  ["255.csv", {
    "file": xxyyzz + "255.csv",
    "tableName": "255", "separator": ",", "encloser": 'din',
    "bColNames": true, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  //import of file containing Simplified Chinese (GB2312) characters
  ["257.csv", {
    "file": xxyyzz + "257.csv",
    "tableName": "257", "separator": ",", "encloser": '"',
    "bColNames": false, "ignoreTrailingDelimiter": false,
    "charset": "GB2312"}
  ]
);

csvFiles.push(
  //import "" as an empty string
  ["323.csv", {
    "file": xxyyzz + "323.csv",
    "tableName": "323", "separator": ",", "encloser": '"',
    "bColNames": false, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  //very long column values (so regexp cannot be used)
  ["424.csv", {
    "file": xxyyzz + "424.csv",
    "tableName": "424", "separator": ",", "encloser": '"',
    "bColNames": true, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  //fields with single quotes should get quoted
  ["460.csv", {
    "file": xxyyzz + "460.txt",
    "tableName": "460", "separator": "\t", "encloser": 'N',
    "bColNames": false, "ignoreTrailingDelimiter": true,
    "charset": "ISO-8859-1"}
  ]
);

csvFiles.push(
  //tab delimited; first row has 2 fields but later rows have 3 or 4; those will be rejected
  ["affiliation_terms.csv", {
    "file": xxyyzz + "affiliation_terms.csv",
    "tableName": "affiliation_terms", "separator": "\t", "encloser": 'N',
    "bColNames": false, "ignoreTrailingDelimiter": false,
    "charset": "ISO-8859-1"}
  ]
);

csvFiles.push(
  //import of file containing blob values as X'...'
  ["blob1.csv", {
    "file": xxyyzz + "blob1.csv",
    "tableName": "blob1", "separator": ",", "encloser": '"',
    "bColNames": true, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  //it should import 5 records with 5 columns each
  //first comma means first column is null
  //,, means the field between them is null
  //if field begins with " and doesn't end with " it will cause non-import of that line
  //if \r or \n in quoted value, it should not be the end of the record
  //the line beginning with bad will fail to import because of space after " in the third field
  ["csvTest.csv", {
    "file": xxyyzz + "csvTest.csv",
    "tableName": "csvTest", "separator": ",", "encloser": '"',
    "bColNames": false, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  ["csvTest2.csv", {
    "file": xxyyzz + "csvTest2.csv",
    "tableName": "csvTest2", "separator": ",", "encloser": '"',
    "bColNames": true, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  //exported from Google docs
  ["docs-google.csv", {
    "file": xxyyzz + "docs-google.csv",
    "tableName": "docs-google", "separator": ",", "encloser": '"',
    "bColNames": false, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  ["emptyLines.csv", {
    "file": xxyyzz + "emptyLines.csv",
    "tableName": "emptyLines", "separator": ",", "encloser": 'N',
    "bColNames": false, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  ["glossary.csv", {
    "file": xxyyzz + "glossary.csv",
    "tableName": "glossary", "separator": ",", "encloser": '"',
    "bColNames": false, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  ["hindi.csv", {
    "file": xxyyzz + "hindi.csv",
    "tableName": "hindi", "separator": ",", "encloser": 'N',
    "bColNames": false, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  ["issues.csv", {
    "file": xxyyzz + "issues.csv",
    "tableName": "issues", "separator": ",", "encloser": '"',
    "bColNames": true, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  ["try.csv", {
    "file": xxyyzz + "try.csv",
    "tableName": "try", "separator": ",", "encloser": 'N',
    "bColNames": false, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  ["utf16.csv", {
    "file": xxyyzz + "utf16.csv",
    "tableName": "utf16", "separator": ",", "encloser": '"',
    "bColNames": false, "ignoreTrailingDelimiter": false,
    "charset": "UTF-16"}
  ]
);

csvFiles.push(
  ["utf8.csv", {
    "file": xxyyzz + "utf8.csv",
    "tableName": "utf8", "separator": ",", "encloser": '"',
    "bColNames": true, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

csvFiles.push(
  ["filenameischinese.csv", {
    "file": xxyyzz + "一二三四五六七八九十.csv",
    "tableName": "一二三四五六七八九十", "separator": ",", "encloser": '"',
    "bColNames": false, "ignoreTrailingDelimiter": false,
    "charset": "GB2312"}
  ]
);

csvFiles.push(
  //values are separated by , followed by space and enclosed by " except for numbers
  //Lines 5,20 are problem because they have , in some string values
  //the space after , gets counted as a part of the value
  ["549.csv", {
    "file": xxyyzz + "549.csv",
    "tableName": "549", "separator": ",", "encloser": '"',
    "bColNames": true, "ignoreTrailingDelimiter": false,
    "charset": "UTF-8"}
  ]
);

return csvFiles;

