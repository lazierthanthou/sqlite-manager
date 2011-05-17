#!/bin/bash

fileTranslators=translators.txt

downloadLocales () {
  while IFS='|' read relflag locale language translator; do
    if [ $relflag = "rel" ]; then
      xrLangFile="sqlitemanager-xr-"$version"-"$locale".zip"
      xpiLangFile="sqlitemanager-"$version"-"$locale".xpi"
      #use quotes because some variables may have spaces
      wget http://www.babelzilla.org/wts/download/locale/all/blank/4034 blank-all.tar.gz
      wget http://www.babelzilla.org/wts/download/locale/all/blank/4034 blank-all.tar.gz
    fi
  done < $fileTranslators
}

downloadSelectedLocales () {
  dirLocales=$HOME/lazierthanthou/sqlite-manager/locales/
  dirUnzip=locales_$1
  fileDownload=$1-selected.tar.gz
  wget http://www.babelzilla.org/wts/download/locale/selected/$1/4034 -O $fileDownload
  rm -r $dirUnzip
  mkdir -p $dirUnzip
  tar -xvf $fileDownload -C $dirUnzip
  rm -r $dirLocales$dirUnzip
  mv $dirUnzip $dirLocales
}

downloadSelectedLocales blank
downloadSelectedLocales replaced

####################################################
