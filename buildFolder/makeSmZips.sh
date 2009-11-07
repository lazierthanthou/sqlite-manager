fxDir="/home/user/.mozilla/firefox/vxs9kov2.default/"
smDir=$fxDir"mrinal/SQLiteManager/"
destDir="/home/user/Desktop/"

#echo "Specify version: \c"
#read version
version="0.5.7a1"
xrFile="SQLiteManager_XR_"$version".zip"
xpiFile="SQLiteManager_"$version".xpi"

cd $smDir

tmpFile="buildFolder/temp.txt"
echo "Modifying application.ini ..."
buildID=`date +%Y%m%d%H%M`
sed s/^BuildID=[^\n\r]*/BuildID=$buildID/g application.ini > $tmpFile
mv $tmpFile application.ini
sed s/^Version=[^\n\r]*/Version=$version/g application.ini > $tmpFile
mv $tmpFile application.ini
echo "application.ini modified."

echo "Modifying install.rdf ..."
sed s/\<em:version\>[0-9a-zA-Z\.]*/\<em:version\>$version/g install.rdf > $tmpFile
mv $tmpFile install.rdf
echo "install.rdf modified."

echo "Set correct permissions on all the files"
chmod -R 744 ./

echo "Creating zip file: "$xrFile
zip -r $xrFile ./  -i@buildFolder/zipInclude.lst -x@buildFolder/zipExclude.lst > buildFolder/logZip.txt
echo "Moving zip file "$xrFile" to " $destDir
mv $xrFile $destDir

echo "Creating xpi file: "$xpiFile
zip -r $xpiFile ./  -i@buildFolder/xpiInclude.lst -x@buildFolder/xpiExclude.lst > buildFolder/logXpi.txt
echo "Moving zip file "$xpiFile" to " $destDir
mv $xpiFile $destDir

echo "Unzipping the xpi file..."
cd $fxDir/extensions/SQLiteManager@mrinalkant.blogspot.com
unzip -o $destDir$xpiFile 

echo "Installing xulrunner app"
sudo xulrunner-1.9.1 --install-app $destDir$xrFile
executable=/usr/lib/mrinalkant/sqlite-manager/sqlite-manager
appini=/usr/lib/mrinalkant/sqlite-manager/application.ini
echo "Creating shortcut for executable in /usr/bin/"
sudo ln -s $executable /usr/bin/sqlite-manager
echo "Creating shortcut for application.ini in /home/user/"
sudo ln -s $appini ~/sm_app.ini

echo "Press any key to exit..."
read xxx
exit
