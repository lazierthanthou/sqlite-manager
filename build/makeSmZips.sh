#!/bin/bash

cd $(dirname $(readlink -f "$0"))/..
rootDir=`pwd` #rootDir is one level above this script's dir

buildDir=$rootDir/build
releaseDir=$rootDir/release
sourceDir=$rootDir/sqlite-manager
outDir=$rootDir/out
workDir=$outDir/workhere
babelDir=$rootDir/locales/locales_replaced

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
fileTranslators=$buildDir/translators.txt

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

  echo "Set correct permissions on alll the files"
  chmod -R 744 ./

  echo "Creating zip file: "$xrFile
  zip -r $xrFile ./  -i@$zipInclude -x@$zipExclude >> $logFile
  echo "Moving zip file "$xrFile" to release/"
  mv $xrFile $releaseDir/

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
  mv $xpiFile $releaseDir/

  cd $rootDir
  rm -r $workDir
}

####################################################
installXR () {
  xrAllLocales="sqlitemanager-xr-"$version"-all.zip"
  echo "Installing xulrunner app"
  sudo xulrunner --install-app $releaseDir/$xrAllLocales
  executable=/usr/lib/mrinalkant/sqlite-manager/sqlite-manager
  smappini=/usr/lib/mrinalkant/sqlite-manager/application.ini
  echo "Creating shortcut for executable in /usr/bin/"
  sudo ln -s $executable /usr/bin/sqlite-manager
  echo "Creating shortcut for application.ini in /home/user/"
  sudo ln -s $smappini ~/sm_app.ini
}

installXPI () {
  xpiAllLocales="sqlitemanager-"$version"-all.xpi"

  loc=/home/user/.mozilla/firefox/$1/extensions/SQLiteManager@mrinalkant.blogspot.com.xpi

  echo "Installing .xpi file from release:"
  ls -l $releaseDir/$xpiAllLocales

  echo "Installing .xpi files for firefox4 profiles"
  cp --preserve $releaseDir/$xpiAllLocales $loc

  echo "Listing the installed files:"
  ls -l $loc
}

createLangFile () {
  locale=$1
  translator=$2
  language=$3
  filetype=$4

  cd $rootDir
  rm -r $workDir
  mkdir -p $workDir
  cd $workDir

  workFile=""
  newFile=""
  if [ $filetype = "xpi" ]; then
    workFile=$xpiFile
    newFile=$xpiLangFile
  fi
  if [ $filetype = "xr" ]; then
    workFile=$xrFile
    newFile=$xrLangFile
  fi
  
  echo "Extracting the en-US only version: "$workFile
  unzip -o $releaseDir/$workFile

  echo "Copying the locale dir: "$babelDir/$locale
  cp -r $babelDir/$locale $workDir/chrome/locale/

  echo "Adding locale entry in chrome.manifest..."
  if [ $filetype = "xpi" ]; then
    chrome=$workDir/chrome.manifest
    echo "locale sqlitemanager $locale chrome/locale/$locale/" >> $chrome

    #modify install.rdf
    transEntry="<em:translator>$translator ($language)</em:translator>"
    sed -i "/em:creator/a $transEntry" $workDir/install.rdf
  fi
  if [ $filetype = "xr" ]; then
    chrome=$workDir/chrome/chrome.manifest
    echo "locale sqlitemanager $locale file:locale/$locale/" >> $chrome
  fi

  echo "Creating file: "$newFile
  zip -r $newFile ./ >> $logFile
  echo "Moving file $newFile to $releaseDir/"
  mv $newFile $releaseDir/

  cd $rootDir
  rm -r $workDir
}

buildWithVersion () {
  getNewVersion
  getNewBuildId

  xrFile="sqlitemanager-xr-"$version".zip"
  xpiFile="sqlitemanager-"$version".xpi"

  createXpiFile
  createXRFile

  echo "-------------------------------------------------"
  echo "Listing the created files:"
  ls -l $releaseDir/$xpiFile
  ls -l $releaseDir/$xrFile
}

buildWithLanguage () {
  getNewVersion
  getNewBuildId

  xrFile="sqlitemanager-xr-"$version".zip"
  xpiFile="sqlitemanager-"$version".xpi"

  while IFS='|' read relflag locale language translator; do
    if [ $relflag = "rel" ]; then
      xrLangFile="sqlitemanager-xr-"$version"-"$locale".zip"
      xpiLangFile="sqlitemanager-"$version"-"$locale".xpi"
      #use quotes because some variables may have spaces
      createLangFile $locale "$translator" "$language" "xpi"
      createLangFile $locale "$translator" "$language" "xr"
    fi
  done < $fileTranslators
}

buildWithAllLanguages () {
  filetype=$1

  getNewVersion
  getNewBuildId

  xrFile="sqlitemanager-xr-"$version".zip"
  xpiFile="sqlitemanager-"$version".xpi"

  xrLangFile="sqlitemanager-xr-"$version"-all.zip"
  xpiLangFile="sqlitemanager-"$version"-all.xpi"

  cd $rootDir
  rm -r $workDir
  mkdir -p $workDir
  cd $workDir

  workFile=""
  newFile=""
  if [ $filetype = "xpi" ]; then
    workFile=$xpiFile
    newFile=$xpiLangFile
  fi
  if [ $filetype = "xr" ]; then
    workFile=$xrFile
    newFile=$xrLangFile
  fi
  
  echo "Extracting the en-US only version: "$workFile
  unzip -o $releaseDir/$workFile

  while IFS='|' read relflag locale language translator; do
    if [ $relflag = "rel" ]; then
      echo "Copying the locale dir: "$babelDir/$locale
      cp -r $babelDir/$locale $workDir/chrome/locale/

      echo "Adding locale entry in chrome.manifest..."
      if [ $filetype = "xpi" ]; then
        chrome=$workDir/chrome.manifest
        echo "locale sqlitemanager $locale chrome/locale/$locale/" >> $chrome

        #modify install.rdf
        transEntry="<em:translator>$translator ($language)</em:translator>"
        sed -i "/em:creator/a $transEntry" $workDir/install.rdf
      fi
      if [ $filetype = "xr" ]; then
        chrome=$workDir/chrome/chrome.manifest
        echo "locale sqlitemanager $locale file:locale/$locale/" >> $chrome
      fi
    fi
  done < $fileTranslators

  echo "Creating file: "$newFile
  zip -r $newFile ./ >> $logFile
  echo "Moving file $newFile to $releaseDir/"
  mv $newFile $releaseDir/

  cd $rootDir
  rm -r $workDir
}

runDbWithXrApp () {
  /usr/bin/sqlite-manager -f $HOME/Desktop/csvtrial.sqlite
}
userOption="z"

while [ ! $userOption = "x" ]; do
    echo "======================================================="
    echo "Please choose one of these options:"
    echo "----"
    echo "b : build & install extension"
    echo "c : build with language"
    echo "i : install xulrunner app"
    echo "r : run the xulrunner app (option to speed up testing)"
    echo "j : install .xpi for firefox4 profiles"
    echo "bz : download locale files from babelzilla"
    echo "----"
    echo "u : upload to code.google.com"
    echo "----"
    echo "l : make localization packs"
    echo "----"
    echo "x : exit"
    read -p "Type your option: " -r userOption

###########################################
    if [ $userOption = "b" ]; then
      buildWithVersion
      buildWithAllLanguages xpi
      buildWithAllLanguages xr
    fi

    if [ $userOption = "c" ]; then
      buildWithAllLanguages xpi
      buildWithAllLanguages xr
      #buildWithLanguage
    fi

    if [ $userOption = "i" ]; then
      installXR
    fi
    if [ $userOption = "r" ]; then
      runDbWithXrApp
    fi
    if [ $userOption = "j" ]; then
      installXPI "vxs9kov2.default"
      installXPI "8tk8ecqd.localhost"
    fi

    if [ $userOption = "u" ]; then
      sh $buildDir/uploader.sh
    fi

    if [ $userOption = "l" ]; then
      sh $buildDir/langpacks.sh
    fi

    if [ $userOption = "bz" ]; then
      cd $outDir
      sh $buildDir/getLocalesFromBz.sh
    fi

###########################################
done;

exit
