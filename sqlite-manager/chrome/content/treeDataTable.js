// ****** table event handling and display ******

// SmDatabaseTreeView: Create a custom nsITreeView
function SmDatabaseTreeView(sTreeId) {
  this.mTreeId = sTreeId;

  // 2 dimensional array containing table contents
  this.aTableData = [];

  // Column information
  this.aColumns = [];
  this.aTypes = [];

  this.aOrder = [];
}

SmDatabaseTreeView.prototype = {
  init: function(aTableData, aColumns, aTypes) {
    this.aTableData = aTableData;
    // Column information
    this.aColumns = aColumns;
    this.aTypes = aTypes;

    this.aOrder = [];
    for (var i=0; i < this.aColumns.length; i++)
      this.aOrder.push(-1);//0=asc; 1=desc

    //without this re-assigning the view, we get extra rows when we use last button in the navigation panel in browse tab.
    document.getElementById(this.mTreeId).view = this;
  },

  get rowCount() { return this.aTableData.length; },
  getCellText: function(row, col) {
    try {
      return this.aTableData[row][col.id];
    }
    catch (e) {
      return "<" + row + "," + col.id + ">";
    }
  },
  //function to get sqlite data type
  getCellDataType: function(row, col) {
    try {
      return this.aTypes[row][col.id];
    }
    catch (e) {
      return SQLiteTypes.TEXT;
    }
  },

  setTree: function(treebox) { this.treebox = treebox; },
  isContainer: function(row) { return false; },
  isSeparator: function(row) { return false; },
  isSorted: function(row) { return false; },
  getLevel: function(row) { return 0; },
  getImageSrc: function(row, col) { return null; },
  getRowProperties: function(row, properties) {},
  getCellProperties: function(row, col, properties) {
    properties = "";
    switch(this.aTypes[row][col.id]) {
      case SQLiteTypes.INTEGER:
        properties = "integervalue";
        break;
      case SQLiteTypes.REAL:
        properties = "floatvalue";
        break;
      case SQLiteTypes.BLOB:
        properties = "blobvalue";
        break;
      case SQLiteTypes.NULL: 
        properties = "nullvalue";
        break;
      case SQLiteTypes.TEXT:
      default:
        properties = "textvalue";
        break;
    }
    if (typeof this.getCellText(row,col) == "number") {
      properties += " numbervalue ";
    }
    properties += " tabledata ";
    return properties;
  },

  getColumnProperties: function(colid, col, properties){},

  cycleHeader: function(col) {
    if (this.mTreeId == "browse-tree") {
      var index  = col.id; 
      var colname = this.aColumns[index][0];
      var aSortInfo = SQLiteManager.changeSortOrder(colname);

      var sBgColor = "black";
      for(var i = 0; i < aSortInfo.length; i++) {
        if (aSortInfo[i][0] == colname) {
          switch (aSortInfo[i][1]) {
            case "asc":
              sBgColor = "green";
              break;
            case "desc":
              sBgColor = "red";
              break;
          }
        }
      }

      col.element.setAttribute("style", "color:" + sBgColor);

      //the following function repopulates the data in the view by calling this view's init function indirectly via TreeDataTable's PopulateTableData function
      SQLiteManager.loadTabBrowse(false);
    }
    else
      this.SortColumn(col);
  },

  //this function is used only for tree in execute tab
  SortColumn: function(col) {
    var index  = col.id; 
    var name = this.aColumns[index][0];
    var type = this.aColumns[index][1];
    var isnum = ((this.aColumns[index][2]==1)?1:0);
    this.aOrder[index] = (this.aOrder[index]==0)?1:0;
    var order = this.aOrder[index];
//alert(order+"="+name);
    
    this.SortTable(this.aTableData, index, order, isnum);  // sort the table
    this.treebox.invalidate();
  },

// This is the actual sorting method, extending the array.sort() method
  SortTable: function(table, col, order, isnum) {
    if (isnum) { // use numeric comparison 
        if (order == 0) { // ascending 
            this.columnSort = function (a,b){ return (a[col]-b[col]); };
        }
        else { // descending 
            this.columnSort = function (a,b){ return (b[col]-a[col]); };
        }
    }
    else { // use string comparison 
        if (order == 0){ // ascending 
            this.columnSort = function(a,b){
                return (a[col]<b[col])?-1:(a[col]>b[col])?1:0; };
        }
        else { // descending 
            this.columnSort = function(a,b){
                return (a[col]>b[col])?-1:(a[col]<b[col])?1:0; };
        }
    }
    // use array.sort(comparer) method
    table.sort(this.columnSort);
  }
};


function TreeDataTable(sTreeId) {
  this.mTreeId = sTreeId;
  this.treeTable = null; // Tree containing listing of current table
}

TreeDataTable.prototype = {
  // Last row/col that was clicked on (may be inaccurate if scrolling happened)
  lastRow: -1,
  lastCol: null,

  // Initialize: Set up the treeview which will display the table contents
  init: function() {
    this.treeTable = document.getElementById(this.mTreeId);

    this.treeView = new SmDatabaseTreeView(this.mTreeId);
    this.treeView.init([], [], []);
    //init must be done before assigning to treeTable.view otherwise it does not work
    //this.treetable.view.init() also fails.
    this.treeTable.view = this.treeView;
  },

  // ShowTable: Show/hide any currently displayed table data
  ShowTable: function(bShow) {
    if (this.treeTable == null) 
      return;

    this.treeTable.childNodes[0].hidden = !bShow;
    this.treeTable.childNodes[1].hidden = !bShow;

    if (!bShow) {
      // remove all of the child rows/columns
      SmGlobals.$empty(this.treeTable.childNodes[0]);
      SmGlobals.$empty(this.treeTable.childNodes[1]);
    } 
  },

  // UserCopyCell: copy the cell contents
  UserCopyCell: function() {
    //Issue #392: lastRow = -1, if a row is not clicked over; 0 means first row.
    if (this.lastRow != -1  && this.lastCol) {
      var sCell= this.treeTable.view.getCellText(this.lastRow, this.lastCol);
      if (sCell)
        SQLiteManager.copyText(sCell);
    }
  },
  
  // sFormat: csv, csv-excel, sql
  exportAllRows: function(sFormat) {
    var aOut = [];
    for (var iRow = 0; iRow < this.treeTable.view.rowCount; iRow++) {
      aOut.push(this.GetRowData(iRow, sFormat));
    }

    if (aOut.length > 0)
      return aOut.join("\n");

    return "";
  },

  // UserCopyRows: copy all currently highlighted rows
  // sFormat: csv, csv-excel, sql
  UserCopyRows: function(sFormat) {
    var sel = this.treeTable.view.selection;
    var start = new Object();
    var end = new Object();
    var iRangeCount = sel.getRangeCount();
    var aOut = [];
    for (var iRange = 0; iRange < iRangeCount; iRange++) {
      sel.getRangeAt(iRange,start,end);

      for (var iRow = start.value; iRow <= end.value; iRow++) {
        aOut.push(this.GetRowData(iRow, sFormat));
      }
    }
    if (aOut.length > 0)
      SQLiteManager.copyText(aOut.join("\n"));
  },

  // GetRowData: Get the contents of an entire numbered row, using the specified format
  GetRowData: function(iRow, sFormat) {
    var result = [], oCol, txt;
    var sExtraColId = "";
    var allCols = this.treeTable.getElementsByTagName("treecol");
    for (var i = 0; i < allCols.length; i++) {
      if (allCols.item(i).hasAttribute("extraRowId"))
        sExtraColId = allCols.item(i).id;
    }

    for (var i = 0; i < this.treeTable.columns.length; i++) {
      oCol = this.treeTable.columns.getColumnAt(i);
      if (sExtraColId == oCol.id) {//Issue #151
        continue;
      }

      txt = this.treeTable.view.getCellText(iRow, oCol);
      if (txt == null) {
        if (sFormat == "csv")
          txt = '';
        if (sFormat == "sql")
          txt = 'null';
      }
      else {
        if (typeof txt == "string")
          txt = txt.replace(/"/g,"\"\"");
        txt = '"' + txt + '"';
      }
      result.push(txt);
    }

    if (sFormat == "csv") {
      var sPrefVal = sm_prefsBranch.getCharPref("jsonEximSettings");
      var obj = JSON.parse(sPrefVal);

      var cSeparator = obj.csv.export.separator;
      if(cSeparator == "tab")
        cSeparator = "\t";
      //var cEncloser = obj.csv.export.encloser;
      //var bColNames = obj.csv.export.includeColNames;

      return result.join(cSeparator);
    }
    if (sFormat == "csv-excel")
      return result.join('\t');
    if (sFormat == "sql") //do we need column names too?
      return "INSERT INTO \"someTable\" VALUES (" + result.toString() + ");";

    return "";
  },

  // UserTreeClick: Handle the user clicking on the tree
  UserTreeClick: function(ev) {
  // This event happens AFTER the window has scrolled (if necessary). This means that if the user clicked on an element that is partially off screen, and the screen scrolls to fully display it, then the mouse may no longer be over the correct element.
  //if (ev.button == 2) // Right-click
  //store the row/column that the click occurred on; used when copying cell text
    if (ev && this.treeTable && ev.type == "click") {
      var row = {}, col = {}, obj = {};
      this.treeTable.treeBoxObject.getCellAt(ev.clientX, ev.clientY, row, col, obj);
      //Issue #392: if the click is not over a row, row.value = -1
      if (row && row.value != -1 && col && col.value) {
//alert(row.value + "=" + obj.value);
        // clicked on a cell
        this.lastRow = row.value;
        this.lastCol = col.value;
      }
      else {
        this.lastRow = null;
        this.lastCol = null;
      }
    }
  },

  AddTreecol: function(treecols, sId, col, sColType, iWidth, bLast, bExtraRowId, sBgColor) {
    //bExtraRowId = true for rowid column which is not one of the tables'columns
    var treecol = document.createElement("treecol");
    treecol.setAttribute("label", col);
    treecol.setAttribute("sDataType", sColType);
//    treecol.setAttribute("smSortDir", "none");
    if (bExtraRowId)
      treecol.setAttribute("extraRowId", true);
    treecol.setAttribute("id", sId);
    treecol.setAttribute("width", iWidth);
    treecol.setAttribute("minwidth", 60);
    //Issue #378
    //treecol.setAttribute("context", 'mp-data-treecol');
    if (sBgColor != null)
      treecol.setAttribute("style", "color:"+sBgColor);

// sColType is based on data in first row, which may not be the same
// as the type defined for that column in schema
//    if (sColType != null)
//      treecol.setAttribute("tooltiptext", col + " (" + sColType + ")");

    if (bLast) {
      //want to do anything special for the last column? do it here.
      //issue #485: for the last column remove the flex property so that it can be resized; but resizing requires that view be scrolled to make last splitter visible and even after that the size can be increased only little by little due to paucity of space on the right
      //anyway, flex is not needed because the logic used in calculating width takes care that the entire tree width is used
      //treecol.setAttribute("flex", 1);
    }
    treecols.appendChild(treecol);

    //add a splitter after every column
    var splitter = document.createElement("splitter");
    splitter.setAttribute("class", "tree-splitter");
    splitter.setAttribute("resizebefore", "closest");
    splitter.setAttribute("resizeafter", "grow");
    splitter.setAttribute("oncommand", "SQLiteManager.saveBrowseTreeColState(this)");
    treecols.appendChild(splitter);
  },

  // iExtraColForRowId: indicates column number for the column which is a rowid
  //  0 means no extra rowid, column numbering begins with 1
  //  use this while copying Issue #151
  createColumns: function(aColumns, iExtraColForRowId, aSortInfo) {
    var treecols = this.treeTable.firstChild;
    SmGlobals.$empty(treecols);

    var iColumnCount = 0;
    var iRow;
    var iWidth, iTotalWidth, iMaxWidth;
    var sColType;
    var allCols = [];
    for (var col in aColumns) {
      iColumnCount = iColumnCount + 1;
      var aTemp = [aColumns[col][0], aColumns[col][1]];
      allCols.push(aTemp);
    }

    var iTreeWidth = this.treeTable.boxObject.width;
    for (var iColumn = 0; iColumn < iColumnCount; iColumn++) {
      iTotalWidth = 0;
      iMaxWidth = 0;
      iTotalWidth = iTreeWidth/iColumnCount;
      if (iTotalWidth < 60) iTotalWidth = 60;

      sColType = '';

      var sBgColor = null;
      for(var i = 0; i < aSortInfo.length; i++) {
        if (aSortInfo[i][0] == allCols[iColumn][0]) {
          switch (aSortInfo[i][1]) {
            case "asc":
              sBgColor = "green";
              break;
            case "desc":
              sBgColor = "red";
              break;
          }
        }
      }

      var bExtraColForRowId = (iColumn==iExtraColForRowId-1) ? true : false;
      this.AddTreecol(treecols, iColumn, allCols[iColumn][0], sColType, iTotalWidth, (iColumn==iColumnCount-1?true:false), bExtraColForRowId, sBgColor);
    }
  },

  adjustColumns: function(objColInfo) {
    if (typeof objColInfo.arrId == "undefined" || typeof objColInfo.arrWidth == "undefined")
      return;
    var aCols = this.treeTable.querySelectorAll("treecol");
    for (var i = 0; i < aCols.length; i++) {
      var pos = objColInfo.arrId.indexOf(aCols.item(i).id);
      if (pos >= 0)
        aCols.item(i).width = objColInfo.arrWidth[pos];
    }
  },

  // PopulateTableData: Assign our custom treeview
  PopulateTableData: function(aTableData, aColumns, aTypes) {
    //populate the tree's view with fresh data
    this.treeView.init(aTableData, aColumns, aTypes);
  }
};

