Components.utils.import("resource://sqlitemanager/fileIO.js");

var SmConnectSql = {
  close: function() {
    var answer = confirm('Are you sure you have saved the changes?\nIf not, please press/click on No/Cancel button and save changes before closing this tab.');
    if (answer) {
      return false;
    }

    return true;
  },
  
  loadTab: function() {
    this.populateSqlAll();
    this.populateSqlDb();
  },

  populateSqlAll: function() {
    var txtOnConnectSql = sm_prefsBranch.getComplexValue("onConnectSql", Ci.nsISupportsString).data;
    $$("connectSqlTbAll").value = txtOnConnectSql;
  },

  populateSqlDb: function() {
  },

  saveSqlAll: function() {
    var txtOnConnectSql = $$("connectSqlTbAll").value;
    sm_setUnicodePref("onConnectSql", txtOnConnectSql);
  },

  saveSqlDb: function() {
  },

  cancelEditAll: function() {
    this.populateSqlAll();
  },

  cancelEditDb: function() {
    this.populateSqlDb();
  },

  showHelp: function(sArg) {
    switch (sArg) {
      case 'forAllDb':
      case 'forThisDb':
        smPrompt.alert(null, sm_getLStr("extName"), sm_getLStr('connectSql.' + sArg));
        break;
    }
  }
};
