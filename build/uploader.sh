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

populateVersion () {
  while read ver; do
    version=$ver
    break
  done < $verFile

  read -p "Specify version: ("$version")" -r version1
  if [ ! $version1 = "" ]; then
    version=$version1
#    echo $version > $verFile
  fi
}

populateVersion

xrFile="sqlitemanager-xr-"$version".zip"
xpiFile="sqlitemanager-"$version".xpi"

cd $buildDir

read -p "Upload extension "$xpiFile" (y/n): " -r choice
summary="SQLite Manager "$version
if [ $choice = "y" ]; then
  ./googlecode_upload.py -s "$summary" -p $project -u $guser -w $gpass -l Featured,Type-Extension-xpi,OpSys-All $releaseDir/$xpiFile
fi

read -p "Upload xulrunner app "$xrFile" (y/n): " -r choice
summary="SQLiteManager "$version" as XULRunner App"
if [ $choice = "y" ]; then
  ./googlecode_upload.py -s "$summary" -p $project -u $guser -w $gpass -l Featured,Type-XULRunner-app,OpSys-All $releaseDir/$xrFile
fi

echo "Press any key to exit..."
read xxx
exit
