//this class manages the db tree on the left. It is used to create two objects:
//one, for normal db objects and the other for temp objects
function TreeDbStructure(sTreeId, sTreeChildrenId, iDbObjects) {
  this.mTreeId = sTreeId;
  this.mTreeChildrenId = sTreeChildrenId;
  this.miDbObjects = iDbObjects;

  //an array of two members: first member is an array telling which
  //categories to expand and the second is a list of object names to expand
  this.aExpandedNodes = [[], []];
  this.visibleData = [];
  this.childData = [];
}

TreeDbStructure.prototype = {
  mbSettingChildren: false,
  mAllPrefix: "all-",

  init: function() {
     document.getElementById(this.treeId).view = this;
  },

  removeChildData: function() {
    this.visibleData = [[sm_getLStr("noDb"), true, false]];
    this.init();
  },
  
  setChildData: function(aObjects)  {
    this.mbSettingChildren = true;

    this.visibleData = [];
    this.childData = [];

    var arr = ["master", "table", "view", "index", "trigger"];
    if (this.miDbObjects == 1) arr = ["table"];

    var lbl = ["Master Table", "Tables", "Views", "Indexes", "Triggers"];
    for (var pp = 0; pp < arr.length; pp++) {
      var idx = arr[pp];
      if (aObjects[idx]) {
        this.childData[idx] = aObjects[idx];

        var sLabel = lbl[pp] + " (" + aObjects[idx].length + ")";
      //[cellText, isContainer, isContainerOpen, SmType, iLevel]
      //SmType is application defined attribute set by the extension author here
        this.visibleData.push([sLabel, true, false, this.mAllPrefix+idx,0]);
      }
    }

    //for categories
    for (var iii=0; iii < this.rowCount; iii++) {
      if (this.getLevel(iii) == 0) {
        for (var jjj=0; jjj < this.aExpandedNodes[0].length; jjj++) {
          if (this.aExpandedNodes[0][jjj] == this.getSmType(iii)) {
            this.toggleOpenState(iii);
          }
        }
      }
    }
    //for db objects
    for (var iii=0; iii < this.rowCount; iii++) {
      if (this.getLevel(iii) == 1) {
        for (var jjj=0; jjj < this.aExpandedNodes[1].length; jjj++) {
          if (this.aExpandedNodes[1][jjj] == this.getCellText(iii)) {
            this.toggleOpenState(iii);
          }
        }
      }
    }

    this.mbSettingChildren = false;
    this.init();
  },

  setExpandableNodes: function(aExpand) {
    this.aExpandedNodes = aExpand;
  },

  get treeId() { return this.mTreeId; },
  get treeChildrenId() { return this.mTreeChildrenId; },
  get visibleDataLength() { return this.visibleData.length; },
  getSmType: function(row) { return this.visibleData[row][3]; },
  isTreeReady: function() { return !this.mbSettingChildren; },

  //following are treeview functions
  treeBox: null,
  selection: null,

  get rowCount() { return this.visibleData.length; },
  setTree: function(treeBox) { this.treeBox = treeBox; },
  getCellText: function(row,col) { return this.visibleData[row][0]; },
  isContainer: function(idx) { return this.visibleData[idx][1]; },
  isContainerOpen: function(idx) { return this.visibleData[idx][2]; },
  isContainerEmpty: function(idx)    { return false; },
  isSeparator: function(idx)         { return false; },
  isSorted: function()               { return false; },
  isEditable: function(idx, column)  { return false; },
  getLevel: function(idx) { return this.visibleData[idx][4]; },
  getParentIndex: function(idx) {
    var iLevel = this.getLevel(idx);
    for (var t = idx - 1; t >= 0 ; t--) {
      if (this.getLevel(t) < iLevel) return t;
    }
    return -1;
  },

  hasNextSibling: function(idx, after) {
    var thisLevel = this.getLevel(idx);
    for (var t = idx + 1; t < this.visibleData.length; t++) {
      var nextLevel = this.getLevel(t)
      if (nextLevel == thisLevel) return true;
      else if (nextLevel < thisLevel) return false;
    }
    return false;
  },
  //do not return in between because the this.aExpandedNodes array is being populated at the end.
  toggleOpenState: function(idx) {
    if (!this.isContainer(idx)) return;

    var thisLevel = this.getLevel(idx);
    var item = this.visibleData[idx];

    if (this.isContainerOpen(idx)) {
      this.visibleData[idx][2] = false;

      var deletecount = 0;
      for (var t = idx + 1; t < this.visibleData.length; t++) {
        if (this.getLevel(t) > thisLevel) deletecount++;
        else break;
      }
      if (deletecount) {
        this.visibleData.splice(idx + 1, deletecount);
        this.treeBox.rowCountChanged(idx + 1, -deletecount);
      }
    }
    else {
      this.visibleData[idx][2] = true;

      if(thisLevel == 0) {
        var label = this.getSmType(idx).substring(this.mAllPrefix.length);
        var toinsert = this.childData[label];
        var sType = label;
        var bContainer = false;
        if (label == "table" || label == "master" || label == "view")
          bContainer = true;

        for (var i = 0; i < toinsert.length; i++) {
           this.visibleData.splice(idx + i + 1, 0, [toinsert[i], bContainer, false, sType, thisLevel + 1]);
        }
        this.treeBox.rowCountChanged(idx + 1, toinsert.length);
      }

      if(thisLevel == 1 && (this.getSmType(idx) == "table" || this.getSmType(idx) == "master" || this.getSmType(idx) == "view")) {
        var info = SQLiteManager.getTableInfo(this.getCellText(idx), "");
        for(var i = 0; i < info.length; i++) {
          this.visibleData.splice(idx + i + 1, 0, [[info[i].name], false, false, "someColumn", thisLevel + 1]);
        }
        this.treeBox.rowCountChanged(idx + 1, info.length);
      }
    }
    //use indexOf to search, then add or delete
    //populate aExpandedNodes again
    if (!this.mbSettingChildren) {
      this.aExpandedNodes = [[],[]];
      for (var iii = 0; iii < this.rowCount; iii++) {
        if (this.isContainerOpen(iii)) {
          if (this.getLevel(iii) == 0)
            this.aExpandedNodes[0].push(this.getSmType(iii));
          if (this.getLevel(iii) == 1)
            this.aExpandedNodes[1].push(this.getCellText(iii));
        }
      }
    }
  },

  getImageSrc: function(idx, column) {},
  getProgressMode : function(idx,column) {},
  getCellValue: function(idx, column) {},
  cycleHeader: function(col, elem) {},
  selectionChanged: function() {},
  cycleCell: function(idx, column) {},
  performAction: function(action) {},
  performActionOnCell: function(action, index, column) {},
  getRowProperties: function(idx, column, prop) {},
  getCellProperties: function(row, col, properties) {
    properties = "";
    if (this.getSmType(row) == "table") {
      properties = "dbObjTable";
    }
    if (this.getSmType(row) == "index") {
      properties = "dbObjIndex";
    }
    if (this.getSmType(row) == "view") {
      properties = "dbObjView";
    }
    if (this.getSmType(row) == "trigger") {
      properties = "dbObjTrigger";
    }
    return properties;
  },
  getColumnProperties: function(column, element, prop) {}
};
