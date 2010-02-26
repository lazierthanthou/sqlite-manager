set the following for development environment:

nglayout.debug.disable_xul_cache  true
javascript.options.showInConsole  true
layout.css.report_errors          true
--------------------------------------------------

drill for uploading to AMO:
1. upload to babelzilla as minor update
2. download all locales with missing strings replaced to hg root dir
3. extract it there itself
4. edit smversion in langpacks.sh & build the language pack
5. upload the main xpi and the language packs to amo

