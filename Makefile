JS = robozzle.js jquery.hotkeys.js jquery.soap.js sha1.js spin.min.js
TARGETS = index.html robozzle.css $(JS)

.PHONY: all
all: $(TARGETS)
	mkdir -p install
	cp -a $(TARGETS) install/

robozzle.css: robozzle.scss
	scss -r ./base64-encode.rb $(^) $(@)

.DELETE_ON_ERROR:
