//localized description for this extension
pref("extensions.{SQLiteManager@mrinalkant.blogspot.com}.description", "chrome://sqlitemanager/locale/strings.properties");

//position in target application (only Firefox) as a menuitem
//As of now, 1 stands for show menuitem in Tools menu. 0 means hide it.
//for other values do nothing
pref("extensions.sqlitemanager.posInTargetApp", 1);

pref("extensions.sqlitemanager.autoBackup", "off");//on, off, prompt

//openmode: 1=chrome window, 2=tab
pref("extensions.sqlitemanager.openMode", 1);

//false = do not open any db on start, true = open last used db on start
pref("extensions.sqlitemanager.openWithLastDb", true);
pref("extensions.sqlitemanager.promptForLastDb", true);

//how many records to display when browsing and searching; -1 means all
pref("extensions.sqlitemanager.displayNumRecords", 100);

pref("extensions.sqlitemanager.userDir", "");

//related to main toolbar area and the included toolbars
pref("extensions.sqlitemanager.hideMainToolbar", false);
pref("extensions.sqlitemanager.showMainToolbarDatabase", true);
pref("extensions.sqlitemanager.showMainToolbarTable", true);
pref("extensions.sqlitemanager.showMainToolbarIndex", true);
pref("extensions.sqlitemanager.showMainToolbarDebug", false);

//default extension for sqlite db files
pref("extensions.sqlitemanager.sqliteFileExtensions", "sqlite");

//for search
pref("extensions.sqlitemanager.searchToggler", true);
pref("extensions.sqlitemanager.searchCriteria", "");

//for confirmation prompt before executing queries
//pref("extensions.sqlitemanager.confirmOperations", ":rowInsert=1:rowUpdate=1:rowDelete=1:create=1:otherSql=1:");
pref("extensions.sqlitemanager.confirm.records", true);
pref("extensions.sqlitemanager.confirm.create", true);
pref("extensions.sqlitemanager.confirm.otherSql", true);

//for extension management table name
pref("extensions.sqlitemanager.tableForExtensionManagement", "__sm_ext_mgmt");

//for max number of columns in create table dialog
pref("extensions.sqlitemanager.maxColumnsInTable", 20);

//whether to allow multiline input fields for various row operations
//like insert, update
pref("extensions.sqlitemanager.whetherMultilineInput", true);

//Blob related
//text to show for blob fields for increased performance
pref("extensions.sqlitemanager.textForBlob", "BLOB");
//display size of blob in the blob fields (gives better idea of data)
pref("extensions.sqlitemanager.showBlobSize", true);
//max size of blob to display as string (convert to string)
pref("extensions.sqlitemanager.maxSizeToShowBlobData", 50);
//how to show data: 0=hex, 1=string
pref("extensions.sqlitemanager.blob.howToShowData", 0);

//unsafe alter table operations (delete/alter column) are disabled by default
//pref("extensions.sqlitemanager.allowUnsafeTableAlteration", false);

//handle ADS
pref("extensions.sqlitemanager.handleADS", 0);

//handle ADS
pref("extensions.sqlitemanager.identifierQuoteChar", '""');

//not frozen
//allowed values: previous/default
pref("extensions.sqlitemanager.whenInsertingShow", "previous");
//full path of dir where smFunctions.sqlite is located.
//This db stores user-defined functions (udf).
pref("extensions.sqlitemanager.udfDbDirPath", "");

//duration (in seconds) of display of notification messages
pref("extensions.sqlitemanager.notificationDuration", 4);

//stores JSON object for MRU
pref("extensions.sqlitemanager.jsonMruData", '{"meta":{"version":"1"},"size":10,"list":[]}');

//stores SQL statements to run when a connection is made to a database
pref("extensions.sqlitemanager.onConnectSql", '');

//stores JSON object for data tree style.
pref("extensions.sqlitemanager.jsonDataTreeStyle", '{"meta":{"version":"2"},"setting":"default","nullvalue":{"unselected":{"background-color":"#ffcccc","color":"#000000"},"selected":{"background-color":"#ff6666","color":"#ffffff"}},"integervalue":{"unselected":{"background-color":"#ccffcc","color":"#000000"},"selected":{"background-color":"#339933","color":"#ffffff"}},"floatvalue":{"unselected":{"background-color":"#66ff66","color":"#000000"},"selected":{"background-color":"#00cc00","color":"#ffffff"}},"textvalue":{"unselected":{"background-color":"#ccffff","color":"#000000"},"selected":{"background-color":"#000066","color":"#ffffff"}},"blobvalue":{"unselected":{"background-color":"#ccccff","color":"#000000"},"selected":{"background-color":"#333399","color":"#ffffff"}},"textFont":{"unselected":{"font-size":100,"font-family":""}},"rowHeight":0}');
//stores JSON object for export/import settings.
pref("extensions.sqlitemanager.jsonEximSettings", '{"meta":{"version":"1"},"csv":{"export":{"separator":",","encloser":"din","includeColNames":false},"import":{"separator":",","encloser":"din","includeColNames":false}}}');
