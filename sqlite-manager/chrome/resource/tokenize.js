let EXPORTED_SYMBOLS = ["sql_tokenizer", "replaceObjectNameInSql", "getViewSchemaSelectStmt"];

//follow the function SQLITE_API int sqlite3_complete(const char *zSql)
//from sqlite3.c (3.5.9)
var tkSEMI    = 0;
var tkWS      = 1;
var tkOTHER   = 2;
var tkEXPLAIN = 3;
var tkCREATE  = 4;
var tkTEMP    = 5;
var tkTRIGGER = 6;
var tkEND     = 7;

var trans = [
                     /* Token:                                                */
     /* State:       **  SEMI  WS  OTHER EXPLAIN  CREATE  TEMP  TRIGGER  END  */
     /* 0   START: */ [    0,  0,     1,      2,      3,    1,       1,   1,  ],
     /* 1  NORMAL: */ [    0,  1,     1,      1,      1,    1,       1,   1,  ],
     /* 2 EXPLAIN: */ [    0,  2,     1,      1,      3,    1,       1,   1,  ],
     /* 3  CREATE: */ [    0,  3,     1,      1,      1,    3,       4,   1,  ],
     /* 4 TRIGGER: */ [    5,  4,     4,      4,      4,    4,       4,   4,  ],
     /* 5    SEMI: */ [    5,  5,     4,      4,      4,    4,       4,   6,  ],
     /* 6     END: */ [    0,  6,     4,      4,      4,    4,       4,   4,  ]
  ];

function sql_tokenizer(input) {
  //Issue 537 - let us avoid proceeding with invalid input
  if (typeof input != 'string')
    return [];
  if (input == '') //issue 537 was observed in this case
    return [];

  var re_comment_oneline = /--[^\n]*/
  var re_comment_multiline = /\/\*(?:.|[\n\r])*?\*\//

  var re_ident = /[a-zA-Z_][\w]*/

  var re_integer = /[+-]?\d+/
  var re_float = /[+-]?\d+(([.]\d+)*([eE][+-]?\d+))?/

  var re_doublequote = /["][^"]*["]/
  var re_singlequote = /['][^']*[']/
  var re_backquote = /[`][^`]*[`]/
  var re_msstyleidentifier = /[\[][^\]]*[\]]/

  var re_spaces = /[\s]+/
  var re_symbol = /\S/

  var re_token = /--[^\n]*|\/\*(?:.|\n|\r)*?\*\/|["][^"]*["]|['][^']*[']|[`][^`]*[`]|[\[][^\]]*[\]]|[a-zA-Z_][\w]*|[+-]?\d+(([.]\d+)*([eE][+-]?\d+))?|[+-]?\d+|[\s]+|./g
  var a = input.match(re_token);

  var token, type, tk, stmt = "", state = 0;
  var s = [], allSt = [];
//bOnlyWhitespace: false if a non-whitespace token is found within a statement.
//this is used to add the last statement if (it contains any token except tkWS
//and it is not terminated by semicolon)
  var bOnlyWhitespace = true;
  for (var i = 0; i < a.length; i++) {
    type = "symbol";
    tk = tkOTHER;
    token = a[i];
    if (token == ";") {
      tk = tkSEMI;
    }
    else if (token.match(re_comment_oneline)) {
      tk = tkWS;
      type = "linecomment";
    }
    else if (token.match(re_comment_multiline)) {
      tk = tkWS;
      type = "fullcomment";
    }
    else if (token.match(re_spaces)) {
      tk = tkWS;
      type = "ws";
    }
    else if (token.match(re_ident)) {
      type = "ident";
      var tt = token.toLowerCase();
      if (tt == "create")
        tk = tkCREATE;
      else if (tt == "temp" || tt == "temporary")
        tk = tkTEMP;
      else if (tt == "trigger")
        tk = tkTRIGGER;
      else if (tt == "explain")
        tk = tkEXPLAIN;
      else if (tt == "end")
        tk = tkEND;
    }
    if (token.match(/[\n\s]+/))
      tk = tkWS;
    state = trans[state][tk];
    stmt += token;
    if (tk != tkWS) bOnlyWhitespace = false;
    if (state == 0 && tk == tkSEMI) {
      allSt.push(stmt);
      stmt = "";
      bOnlyWhitespace = true;
    }
    
  }
//  if (stmt != "" && /\s*/.exec(stmt)[0].length != stmt.length)
  if (stmt != "" && !bOnlyWhitespace)
    allSt.push(stmt);

  return allSt;
}

// for create statements in sqlite master
function replaceObjectNameInSql(sOriginalSql, sNewObjName) {
  var re_ident = /[a-zA-Z_][\w]*/

  var re_doublequote = /["][^"]*["]/
  var re_singlequote = /['][^']*[']/
  var re_backquote = /[`][^`]*[`]/
  var re_msstyleidentifier = /[\[][^\]]*[\]]/

  var re_token = /--[^\n]*|\/\*(?:.|\n|\r)*?\*\/|["][^"]*["]|['][^']*[']|[`][^`]*[`]|[\[][^\]]*[\]]|[a-zA-Z_][\w]*|[+-]?\d+(([.]\d+)*([eE][+-]?\d+))?|[+-]?\d+|[\s]+|./g

  var a = sOriginalSql.match(re_token);

  var token, type, tk, stmt = "", state = 0;
  var s = [], allSt = [];
  var tempTokens = [];

  for (var i = 0; i < a.length; i++) {
    token = a[i];
    if (token.match(re_ident)
      || token.match(re_doublequote)
      || token.match(re_singlequote)
      || token.match(re_backquote)
      || token.match(re_msstyleidentifier)) {
      var tt = token.toLowerCase();
      if (tempTokens.length < 3)
        tempTokens.push([i,tt]);
      else
        break;
    }
  }
  var aTypes = ["table", "index", "view", "trigger"];
  if (tempTokens.length >= 3) {
    if (tempTokens[0][1] == "create" && aTypes.indexOf(tempTokens[1][1]) >= 0) {
      var iObjNamePosition = tempTokens[2][0]; //position of original name
      a[iObjNamePosition] = sNewObjName; //change name
      return a.join(""); //new statement with objname replaced
    }  
  }
  //otherwise return empty string
  return "";
}

function getViewSchemaSelectStmt(sOriginalSql) {
  var re_ident = /[a-zA-Z_][\w]*/

  var re_doublequote = /["][^"]*["]/
  var re_singlequote = /['][^']*[']/
  var re_backquote = /[`][^`]*[`]/
  var re_msstyleidentifier = /[\[][^\]]*[\]]/

  var re_token = /--[^\n]*|\/\*(?:.|\n|\r)*?\*\/|["][^"]*["]|['][^']*[']|[`][^`]*[`]|[\[][^\]]*[\]]|[a-zA-Z_][\w]*|[+-]?\d+(([.]\d+)*([eE][+-]?\d+))?|[+-]?\d+|[\s]+|./g

  var a = sOriginalSql.match(re_token);

  var token, type, tk, stmt = "", state = 0;
  var s = [], allSt = [];
  var tempTokens = [];

  for (var i = 0; i < a.length; i++) {
    token = a[i];
    if (token.match(re_ident)
      || token.match(re_doublequote)
      || token.match(re_singlequote)
      || token.match(re_backquote)
      || token.match(re_msstyleidentifier)) {
      var tt = token.toLowerCase();
      if (tempTokens.length < 4)
        tempTokens.push([i,tt]);
      else
        break;
    }
  }
  var aTypes = ["table", "index", "view", "trigger"];
  if (tempTokens.length >= 4) {
    if (tempTokens[0][1] == "create" && aTypes.indexOf(tempTokens[1][1]) >= 0) {
      var iObjNamePosition = tempTokens[2][0]; //position of original name
      iObjNamePosition = tempTokens[3][0]; //position of "AS" in view stmt
      a.splice(0, iObjNamePosition + 1); //remove tokens upto name
      return a.join(""); //string after removing "create objtype objname"
    }  
  }
  //otherwise return empty string
  return "";
}

