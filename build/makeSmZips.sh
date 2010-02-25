#!/bin/bash

#hg clone https://sqlite-manager.googlecode.com/hg/

rootDir="/home/user/sqlite-manager"

buildDir=$rootDir/build
releaseDir=$rootDir/release
outDir=$rootDir/out
workDir=$rootDir/sqlite-manager

mkdir -p $releaseDir
mkdir -p $outDir

verFile=$outDir/version.txt
tmpFile=$outDir/temp.txt
logFile=$outDir/log.txt

zipInclude=$buildDir/zipInclude.lst
zipExclude=$buildDir/zipExclude.lst
xpiInclude=$buildDir/xpiInclude.lst
xpiExclude=$buildDir/xpiExclude.lst

appIni=$workDir/application.ini
installRdf=$workDir/install.rdf

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

xrFile="sqlitemanager-xr-"$version".zip"
xpiFile="sqlitemanager-"$version".xpi"

cd $workDir

modifyAppIni () {
  echo "Modifying application.ini ..."
  buildID=`date +%Y%m%d%H%M`
  sed s/^BuildID=[^\n\r]*/BuildID=$buildID/g $appIni > $tmpFile
  mv $tmpFile $appIni
  sed s/^Version=[^\n\r]*/Version=$version/g $appIni > $tmpFile
  mv $tmpFile $appIni
  echo "application.ini modified."
}
modifyInstallRdf () {
  echo "Modifying install.rdf ..."
  sed s/\<em:version\>[0-9a-zA-Z\.]*/\<em:version\>$version/g $installRdf > $tmpFile
  mv $tmpFile $installRdf
  echo "install.rdf modified."
}

initialize () {
  echo "Logging..." > $logFile
}

createXRFile () {
  echo "Set correct permissions on all the files"
  cd $workDir
  chmod -R 744 ./

  echo "Creating zip file: "$xrFile
  zip -r $xrFile ./  -i@$zipInclude -x@$zipExclude >> $logFile
  echo "Moving zip file "$xrFile" to release/"
  mv $xrFile $releaseDir/$xrFile
}

createXpiFile () {
  echo "Creating xpi file: "$xpiFile
  zip -r $xpiFile ./  -i@$xpiInclude -x@$xpiExclude >> $logFile
  echo "Moving zip file "$xpiFile" to release/"
  mv $xpiFile $releaseDir/$xpiFile
}

####################################################
installXR () {
  echo "Installing xulrunner app"
  sudo xulrunner-1.9.1 --install-app $releaseDir/$xrFile
  executable=/usr/lib/mrinalkant/sqlite-manager/sqlite-manager
  smappini=/usr/lib/mrinalkant/sqlite-manager/application.ini
  echo "Creating shortcut for executable in /usr/bin/"
  sudo ln -s $executable /usr/bin/sqlite-manager
  echo "Creating shortcut for application.ini in /home/user/"
  sudo ln -s $smappini ~/sm_app.ini
}

installExt () {
  echo "Unzipping the xpi file..."
  cd /home/user/mrinal/extensions/SQLiteManager@mrinalkant.blogspot.com
  unzip -o $releaseDir/$xpiFile
}

buildWithVersion () {
  initialize
  modifyAppIni
  modifyInstallRdf

  createXpiFile
  createXRFile

  installExt
}

buildSimple () {
  initialize

  createXpiFile
  installExt
}

userOption="z"

while [ ! $userOption = "x" ]; do
    echo "Please choose one of these options:"
    echo "----"
    echo "a : build simple (version and build info don't change)"
    echo "b : build & install extension"
    echo "i : install xulrunner app"
    echo "u : upload to code.google.com"
    echo "----"
    echo "l : make localization packs"
    echo "----"
    echo "x : exit"
    read -p "Type your option: " -r userOption

###########################################
    if [ $userOption = "a" ]; then
      buildSimple
    fi

    if [ $userOption = "b" ]; then
      buildWithVersion
    fi

    if [ $userOption = "i" ]; then
      installXR
    fi

    if [ $userOption = "u" ]; then
      sh $buildDir/uploader.sh
    fi

    if [ $userOption = "l" ]; then
      sh $buildDir/langpacks.sh
    fi

###########################################
done;

exit
