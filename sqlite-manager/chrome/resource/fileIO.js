let EXPORTED_SYMBOLS = ["FileIO"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

var FileIO = {
  getFile: function(sPath) {
    try {
      var f = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
      f.initWithPath(sPath);
      return f;
    } catch (e) {
      Cu.reportError('FileIO.getFile("' + sPath + '"): ' + e.message);
    }
    return null;
  },

  getFileFromProfDir: function(aAppendNames) {
    var file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get('ProfD', Ci.nsIFile);
    for (let sName of aAppendNames)
      file.append(sName);
    return file;
  },

  read: function(file, charset) {
    // |file| is nsIFile
    var fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    var cstream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
    fstream.init(file, -1, 0, 0);
    cstream.init(fstream, charset, 0, 0);

    var data = "";
    var str = {};
    while (cstream.readString(4096, str) != 0) {
      data += str.value;
    }
    cstream.close();
    return data;
  },

  getLines: function(file, charset) {
    var istream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    istream.init(file, 0x01, 0444, 0);

    var is = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);

    //This assumes that istream is the nsIInputStream you want to read from
    is.init(istream, charset, 1024, 0xFFFD);

    // read lines into array
    var lines = [], line = {}, bHasMore = true;
    if (is instanceof Ci.nsIUnicharLineInputStream) {
      do {
          bHasMore = is.readLine(line);
          lines.push(line.value);
      } while (bHasMore);
    }
    istream.close();
    return lines;
  },

//directory listing
  dirListing: function(aDir, bRecursive, aExt) {
    var fileList = aDir.directoryEntries;

    var aSplit, sExt, msg = "";
    var file;
    var iFileCount = 0;
    var aFiles = [];
    while (fileList.hasMoreElements()) {
      file = fileList.getNext().QueryInterface(Ci.nsIFile);
      if (bRecursive) {
        if (file.isDirectory()) {
          var aTemp = this.dirListing(file, bRecursive, aExt);
          aFiles = aFiles.concat(aTemp);
        }
      }
      aSplit = file.leafName.split(".");
      sExt = aSplit[aSplit.length - 1]; 

      if (aExt == sExt.toLowerCase() || aExt == "*") {
        iFileCount++;
        aFiles.push([file.path, file.leafName, file.fileSize]);
      }
    }
    return aFiles;
  }
};

