#!/bin/bash

smversion=0.5.12

cd $(dirname $(readlink -f "$0"))/..
rootDir=`pwd` #rootDir is one level above this script's dir

buildDir=$rootDir/build
releaseDir=$rootDir/release
outDir=$rootDir/out

dirMain=$outDir/tempLangpack

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

  read -p "Specify language pack version: ("$version")" -r version1
  if [ ! $version1 = "" ]; then
    version=$version1
    echo $version > $verFile
  fi

  smversion=$version
  read -p "Which version of sqlite-manager is the pack for? ($smversion)" -r smversion1
  if [ ! $smversion1 = "" ]; then
    smversion=$smversion1
    echo $smversion > $smversion
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
  sed -n '/<!-- TARGETMARKER -->/,$p' $rootDir/sqlite-manager/install.rdf >> $installRdf

  sed -i -e "s/XXXversionXXX/$version/g" $installRdf
  sed -i -e "s/XXXlocaleXXX/$locale/g" $installRdf
  sed -i -e "s/XXXtranslatorXXX/$translator/g" $installRdf
  sed -i -e "s/XXXlanguageXXX/$language/g" $installRdf
  sed -i -e "s/XXXsmversionXXX/$smversion/g" $installRdf

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

  cd $rootDir
  rm -r $dirMain
}

####################################################
initialize

while IFS='|' read locale language translator; do
  if [ $locale = "finished" ]; then
    break
  fi

  #use quotes because some variables may have spaces
  makeLangPack $locale "$translator" "$language"
  echo $locale" == "$translator >> $logFile
done < $fileTranslators

