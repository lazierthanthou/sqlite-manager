#!/bin/bash

project="sqlite-manager"

cd $(dirname $(readlink -f "$0"))/..
rootDir=`pwd` #rootDir is one level above this script's dir

buildDir=$rootDir/build
releaseDir=$rootDir/release
outDir=$rootDir/out

guser=""
gpass=""

getUserAndPass () {
  #use .netrc file which is also used for git push to code.google.com
  #read the line containing 'code.google.com' which should be like:
  #machine code.google.com login username password thepassword
  importantLine=`grep 'code.google.com' $HOME/.netrc`

  set -- $importantLine
  guser=$4
  gpass=$6
}

getUserAndPass

verFile=$outDir/version.txt

version="xxx"
locale=""

populateVersion () {
  while read ver; do
    version=$ver
    break
  done < $verFile

  read -p "Specify version: ("$version")" -r version1
  if [ ! $version1 = "" ]; then
    version=$version1
  fi
}

getLocale () {
  read -p "Specify locale: ("$locale")" -r locale1
  if [ ! $locale1 = "" ]; then
    locale=$locale1
  fi
}

populateVersion
#getLocale

uploadFiles () {
  argLocale=$1
  comment=$2

  summaryXpiPrefix="SQLite Manager "$version
  summaryXrPrefix="SQLiteManager "$version" as XULRunner App"

  if [ $argLocale = "" ]; then
    fileNameSuffix=$version
    labelsXr="Featured,OpSys-All"
    summaryXpi=$summaryXpiPrefix
    summaryXr=$summaryXrPrefix
  fi
  if [ ! $argLocale = "" ]; then
    fileNameSuffix=$version"-"$argLocale
    labelsXr="OpSys-All"
    summaryXpi="$summaryXpiPrefix (for $2 locale)"
    summaryXr="$summaryXrPrefix (for $2 locale)"
  fi
  if [ $argLocale = "all" ]; then
    fileNameSuffix=$version"-"$argLocale
    labelsXr="Featured,OpSys-All"
    summaryXpi="$summaryXpiPrefix (includes $2 locales)"
    summaryXr="$summaryXrPrefix (includes $2 locales)"
  fi

  labelsXpi=$labelsXr",Type-Extension-xpi"

  xrFile="sqlitemanager-xr-"$fileNameSuffix".zip"
  xpiFile="sqlitemanager-"$fileNameSuffix".xpi"

  cd $buildDir

  read -p "Upload files $xpiFile and $xrFile (y/n): " -r choice
  if [ $choice = "y" ]; then
    #upload .xpi later so that it appears on top in downloads tab at sqlite-manager.googlecode.com
    ./googlecode_upload.py -s "$summaryXr" -p $project -u $guser -w $gpass -l $labelsXr $releaseDir/$xrFile

    ./googlecode_upload.py -s "$summaryXpi" -p $project -u $guser -w $gpass -l $labelsXpi $releaseDir/$xpiFile
  fi
}

#uploadFiles localeName commentForLocale
#uploadFiles "sv-SE" "Swedish"
#uploadFiles "ru" "Russian"
#uploadFiles "es-ES" "Spanish"
#uploadFiles "ja" "Japanese"
#uploadFiles "fr" "French"
#uploadFiles "de" "German"
#uploadFiles "" "" #en-US
uploadFiles "all" "English, German, Japanese, French, Italian, Spanish, Russian, Swedish"

echo "Press any key to exit..."
read xxx
exit
