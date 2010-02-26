#!/bin/bash

#hg clone https://sqlite-manager.googlecode.com/hg/

rootDir="/home/user/sqlite-manager"

buildDir=$rootDir/build
releaseDir=$rootDir/release
sourceDir=$rootDir/sqlite-manager
outDir=$rootDir/out
workDir=$outDir/workhere

mkdir -p $releaseDir
mkdir -p $outDir

verFile=$outDir/version.txt
buildIdFile=$outDir/buildId.txt
tmpFile=$outDir/temp.txt
logFile=$outDir/log.txt

zipInclude=$buildDir/zipInclude.lst
zipExclude=$buildDir/zipExclude.lst
xpiInclude=$buildDir/xpiInclude.lst
xpiExclude=$buildDir/xpiExclude.lst

version="xxx"
buildId="xxx"

#initialize log file
echo "Logging..." > $logFile

readVersion () {
  while read ver; do
    version=$ver
    break
  done < $verFile
  echo "Working with version: "$version
}

readBuildId () {
  while read buildId; do
    break
  done < $buildIdFile
  echo "Working with buildId: "$buildId
}

getNewVersion () {
  read -p "Specify version: ("$version")" -r version1
  if [ ! $version1 = "" ]; then
    version=$version1
    echo $version > $verFile
  fi
}

getNewBuildId () {
  buildID=`date +%Y%m%d%H%M`
  echo $buildID > $buildIdFile
}

readVersion

xrFile="sqlitemanager-xr-"$version".zip"
xpiFile="sqlitemanager-"$version".xpi"

createXRFile () {
  echo "Copying source to workdir..."
  mkdir -p $workDir
  cp -r $sourceDir/* $workDir
  cd $workDir

  echo "Modifying application.ini..."
  readVersion
  sed -i -e "s/XXXversionXXX/$version/g" $workDir/application.ini
  readBuildId
  sed -i -e "s/XXXbuildIdXXX/$buildID/g" $workDir/application.ini
  echo "application.ini modified."

  echo "Set correct permissions on all the files"
  chmod -R 744 ./

  echo "Creating zip file: "$xrFile
  zip -r $xrFile ./  -i@$zipInclude -x@$zipExclude >> $logFile
  echo "Moving zip file "$xrFile" to release/"
  mv $xrFile $releaseDir/$xrFile

  cd $rootDir
  rm -r $workDir
}

createXpiFile () {
  echo "Copying source to workdir..."
  mkdir -p $workDir
  cp -r $sourceDir/* $workDir
  cd $workDir

  echo "Modifying install.rdf ..."
  readVersion
  sed -i -e "s/XXXversionXXX/$version/g" $workDir/install.rdf
  echo "install.rdf modified."

  echo "Creating xpi file: "$xpiFile
  zip -r $xpiFile ./  -i@$xpiInclude -x@$xpiExclude >> $logFile
  echo "Moving zip file "$xpiFile" to release/"
  mv $xpiFile $releaseDir/$xpiFile

  cd $rootDir
  rm -r $workDir
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

buildSimple () {
  createXpiFile
  installExt
}

buildWithVersion () {
  getNewVersion
  getNewBuildId

  createXpiFile
  installExt

  createXRFile
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
