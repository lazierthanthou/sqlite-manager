#!/bin/bash

project="sqlite-manager"

rootDir="/home/user/sqlite-manager"

buildDir=$rootDir/build
releaseDir=$rootDir/release
outDir=$rootDir/out

guser=""
gpass=""

getUserAndPass () {
  #hgrc contains username & password
  hgrcFile=$rootDir/.hg/hgrc

  #read the line containing 'https://' which should be like:
  #default = https://username:password@sqlite-manager.googlecode.com/hg/
  importantLine=`grep 'https://' $hgrcFile`

  #remove the text after '@'
  importantLine=`echo ${importantLine%%@*}`
  #now, we have (default = https://username:password)

  #remove the text before last '/' (use ##)
  importantLine=`echo ${importantLine##*/}`
  #now, we have (username:password)

  #username is till the ':', password after it
  guser=`echo ${importantLine%%:*}`
  gpass=`echo ${importantLine##*:}`
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
  read -p "Specify version: ("$locale")" -r locale1
  if [ ! $locale1 = "" ]; then
    locale=$locale1
  fi
}

populateVersion
getLocale

fileNameSuffix=$version
labels="Featured,Type-Extension-xpi,OpSys-All"
summaryXpi="SQLite Manager "$version
summaryXr="SQLiteManager "$version" as XULRunner App"
if [ ! $locale = "" ]; then
  fileNameSuffix=$version"-"$locale
  labels="Type-Extension-xpi,OpSys-All"
  summaryXpi="$summaryXpi (for $locale locale)"
  summaryXr="$summaryXr (for $locale locale)"
fi

xrFile="sqlitemanager-xr-"$fileNameSuffix".zip"
xpiFile="sqlitemanager-"$fileNameSuffix".xpi"

cd $buildDir

read -p "Upload extension "$xpiFile" (y/n): " -r choice
summary=$summaryXpi
if [ $choice = "y" ]; then
  ./googlecode_upload.py -s "$summary" -p $project -u $guser -w $gpass -l $labels $releaseDir/$xpiFile
fi

read -p "Upload xulrunner app "$xrFile" (y/n): " -r choice
summary=$summaryXr
if [ $choice = "y" ]; then
  ./googlecode_upload.py -s "$summary" -p $project -u $guser -w $gpass -l $labels $releaseDir/$xrFile
fi

echo "Press any key to exit..."
read xxx
exit
