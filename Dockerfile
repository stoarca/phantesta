FROM sanic/tails

RUN curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash - && \
    apt-get update && \
    apt-get install -yq fluxbox imagemagick ttf-ancient-fonts x11vnc xdotool xmacro xvfb nodejs bzip2 libgtk-3-0

RUN cd /tmp && \
    wget https://ftp.mozilla.org/pub/firefox/releases/54.0.1/linux-x86_64/en-US/firefox-54.0.1.tar.bz2 -O /tmp/firefox.tar.bz2 && \
    tar jxf firefox.tar.bz2 && \
    cp -r firefox /opt && \
    ln -s /opt/firefox/firefox /usr/local/bin/firefox

RUN cd /tmp && \
    wget https://github.com/mozilla/geckodriver/releases/download/v0.19.1/geckodriver-v0.19.1-linux64.tar.gz -O /tmp/geckodriver.tar.gz && \
    tar xzf geckodriver.tar.gz && \
    cp /tmp/geckodriver /usr/local/bin
