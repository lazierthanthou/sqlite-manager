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

wget http://www.babelzilla.org/wts/download/locale/all/blank/4034 -O blank-all.tar.gz
mkdir -p blank-all
tar -xvf blank-all.tar.gz -C blank-all

wget http://www.babelzilla.org/wts/download/locale/all/replaced/4034 -O replaced-all.tar.gz
mkdir -p replaced-all
tar -xvf replaced-all.tar.gz -C replaced-all

####################################################

