/*these sql statements can be used to create smFunctions.sqlite*/
DROP TABLE IF EXISTS "functions";
CREATE TABLE "functions" ("name" TEXT PRIMARY KEY  NOT NULL ,"body" TEXT NOT NULL ,"argLength" INTEGER,"aggregate" INTEGER NOT NULL  DEFAULT 0 ,"enabled" INTEGER NOT NULL  DEFAULT 1 ,"extraInfo" TEXT);
INSERT INTO "functions" VALUES('regexp','var regExp = new RegExp(aValues.getString(0));
var strVal =new String(aValues.getString(1));

if (strVal.match(regExp)) return 1;
else return 0;',2,0,1,NULL);
INSERT INTO "functions" VALUES('addAll','var sum = 0;
for (var j = 0; j < aValues.numEntries; j++) {
  sum += aValues.getInt32(j);
}
return sum;',-1,0,1,NULL);
INSERT INTO "functions" VALUES('joinValues','var valArr = [];

for (var j = 0; j < aValues.numEntries; j++) {
  switch (aValues.getTypeOfIndex(j)) {
    case 0: //NULL
      valArr.push(null);
      break;
    case 1: //INTEGER
      valArr.push(aValues.getInt64(j));
      break;
    case 2: //FLOAT
      valArr.push(aValues.getDouble(j));
      break;
    case 3: //TEXT
      default:
      valArr.push(aValues.getString(j));   
  }
}
return valArr.join('','');',-1,0,1,NULL);
