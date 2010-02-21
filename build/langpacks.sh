#!/bin/bash

rootDir="/home/user/sqlite-manager"

buildDir=$rootDir/build
releaseDir=$rootDir/release
outDir=$rootDir/out

dirMain=$rootDir/tempLangpack

dirLocale=$dirMain/chrome/locale
fileChrome=$dirMain/chrome.manifest
installRdf=$dirMain/install.rdf
tmpFile=$dirMain/temp

dirBz=$rootDir/SQLite_Manager_all_locales_replaced

installTxt=$buildDir/langpack-install.rdf
fileTranslators=$buildDir/translators.txt

verFile=$outDir/versionLangPack.txt
logFile=$outDir/logLang.txt

version="xxx"

populateVersion () {
  while read ver; do
    version=$ver
    break
  done < $verFile

  read -p "Specify version: ("$version")" -r version1
  if [ ! $version1 = "" ]; then
    version=$version1
    echo $version > $verFile
  fi
}

populateVersion

initialize () {
  echo "Logging..." > $logFile
}

makeLangPack () {
  locale=$1
  translator=$2
  language=$3

  rm -r $dirMain

  dirBzLocale=$dirBz/$locale
  mkdir -p $dirLocale
  cp -r  $dirBzLocale $dirLocale
  echo "locale sqlitemanager "$locale" jar:chrome/sqlitemanager.jar!/locale/"$locale"/">$fileChrome

  cat $installTxt > $installRdf
  sed s/XXXversionXXX/$version/g $installRdf > $tmpFile
  mv $tmpFile $installRdf
  sed s/XXXlocaleXXX/$locale/g $installRdf > $tmpFile
  mv $tmpFile $installRdf
  sed s/XXXtranslatorXXX/$translator/g $installRdf > $tmpFile
  mv $tmpFile $installRdf
  sed s/XXXlanguageXXX/$language/g $installRdf > $tmpFile
  mv $tmpFile $installRdf

  #create the jar
  cd $dirMain/chrome/
  jarFile="sqlitemanager.jar"
  zip -r $jarFile ./ >> $logFile
  rm -r locale/

  #now create the xpi
  cd $dirMain
  xpiFile="langpack-"$version"-"$locale".xpi"
  zip -r $xpiFile ./ >> $logFile
  rm $releaseDir/$xpiFile
  mv $xpiFile $releaseDir
}

####################################################
initialize

while IFS='|' read loc lang tra; do
  if [ $loc = "xxx" ]; then
    break
  fi

  translator=$tra"(Babelzilla)"
  makeLangPack $loc "$translator" "$lang"
  echo $loc" == "$translator >> $logFile
done < $fileTranslators

