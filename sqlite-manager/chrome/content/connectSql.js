Components.utils.import("resource://sqlitemanager/fileIO.js");

var SmConnectSql = {
  //smExtManager can be null if we are not connected to a db at all
  //so, all statements involving smExtManager should be handled in try ... catch blocks
  loadTab: function() {
    this.populateSqlAllDb();

    //for on-connect sql specific to this db, check whether smExtManager is in use
    //if not, disable the controls too
    var bExtManagerEnabled = false;
    try {
      bExtManagerEnabled = smExtManager.getUsage();
    } catch (e) {
      Components.utils.reportError('in function SmConnectSql.loadTab - ' + e);
    }

    if (bExtManagerEnabled) {
      this.populateSqlThisDb();

      $$("connectSqlTbThisDb").removeAttribute('disabled');
      $$("connectSqlBtnSaveThisDb").removeAttribute('disabled');
      $$("connectSqlBtnCancelThisDb").removeAttribute('disabled');
    }
    else {
      $$("connectSqlTbThisDb").value = '';

      $$("connectSqlTbThisDb").setAttribute('disabled', true);
      $$("connectSqlBtnSaveThisDb").setAttribute('disabled', true);
      $$("connectSqlBtnCancelThisDb").setAttribute('disabled', true);
    }
  },

  populateSqlAllDb: function() {
    var txtOnConnectSql = sm_prefsBranch.getComplexValue("onConnectSql", Ci.nsISupportsString).data;
    $$("connectSqlTbAllDb").value = txtOnConnectSql;
  },

  populateSqlThisDb: function() {
    var txtOnConnectSql = '';
    try {
      txtOnConnectSql = smExtManager.getOnConnectSql();
    } catch (e) {
      Components.utils.reportError('in function SmConnectSql.populateSqlThisDb - ' + e);
      this.loadTab();
    }
    $$("connectSqlTbThisDb").value = txtOnConnectSql;
  },

  saveSqlAllDb: function() {
    var txtOnConnectSql = $$("connectSqlTbAllDb").value;
    sm_setUnicodePref("onConnectSql", txtOnConnectSql);
  },

  saveSqlThisDb: function() {
    var txtOnConnectSql = $$("connectSqlTbThisDb").value;
    try {
      smExtManager.setOnConnectSql(txtOnConnectSql);
    } catch (e) {
      Components.utils.reportError('in function SmConnectSql.saveSqlThisDb - ' + e);
      this.loadTab();
    }
  },

  cancelEditAllDb: function() {
    this.populateSqlAllDb();
  },

  cancelEditThisDb: function() {
    this.populateSqlThisDb();
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
