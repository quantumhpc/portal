# Browser access (noVNC): a random password for this session only. The portal
# reads it from ${JOBNAME}.web and hands it to the owner's browser. Never run a
# desktop without a password: anyone who can reach the node could take it over.
mkdir -p "${HOME}/.vnc" && chmod 700 "${HOME}/.vnc"
VNC_WEB_PASS=`head -c 512 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 8`
VNC_RFBAUTH="${HOME}/.vnc/qhpc_${JOBNAME}.passwd"
( umask 077; echo "${VNC_WEB_PASS}" | vncpasswd -f > "${VNC_RFBAUTH}" )
