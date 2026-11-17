#Unix Login
if [ -z "$VNCSECURITY" ]
then
    # Default Security
    VNCSECURITY="TLSPlain"
fi

VNCAUTHOPTS=""
if [ -n "$VNC_RFBAUTH" ]
then
    # Password set by vnc/web_auth.sh (noVNC cannot do TLS security types)
    VNCSECURITY="VncAuth"
    VNCAUTHOPTS="-rfbauth ${VNC_RFBAUTH}"
fi

VNCCMD="vncserver -geometry 1920x1080x1024 -depth 24 -SecurityTypes ${VNCSECURITY} ${VNCAUTHOPTS}"
VNCAnswer=`$VNCCMD 2>&1`

EXIT_CODE=$?
if [ ${EXIT_CODE} -ne 0 ];then
    echo "VNC session failed to start"
    exit 1
fi
VNCFullAdress=`echo ${VNCAnswer} | awk -F" desktop is " '{print $2}' | awk '{print $1}'`