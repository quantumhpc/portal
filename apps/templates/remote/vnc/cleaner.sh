# Stop vncserver once program exits
vncserver -kill :${VNCDISPLAY} > /dev/null 2>&1
rm -f /tmp/.X11-unix/X${VNCDISPLAY} > /dev/null 2>&1
rm -f /tmp/.X${VNCDISPLAY}-lock > /dev/null 2>&1
rm -f "${VNC_RFBAUTH}" "${PBS_O_WORKDIR:-${SLURM_SUBMIT_DIR:-$PWD}}/${JOBNAME}.web" > /dev/null 2>&1
