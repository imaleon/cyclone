const canvas =
    document.getElementById("board");

const holdCanvas =
    document.getElementById("hold");

function handleTouchStart(e){
    if(!running || paused || matchEnded) return;

    const touch = e.changedTouches[0];

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
}

function handleTouchEnd(e){
    if(!running || paused || matchEnded) return;

    const touch = e.changedTouches[0];

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    const time = Date.now() - touchStartTime;

	// TAP (rotate reverse)
	if(absX < 20 && absY < 20 && time < 250){
		rotate(false);
		return;
	}

    // SWIPE LEFT
    if(absX > absY && dx < -30){
        if(!collide(-1,0)){
            piece.x--;
            lastMoveRotate = false;
            if(touchingGround) lockTimer = 0;
        }
        return;
    }

    // SWIPE RIGHT
    if(absX > absY && dx > 30){
        if(!collide(1,0)){
            piece.x++;
            lastMoveRotate = false;
            if(touchingGround) lockTimer = 0;
        }
        return;
    }
	
    // LONG SWIPE DOWN (hard drop)
    if(absY > absX && dy > 120){
        hardDrop();
        return;
    }

    // SWIPE DOWN (soft drop)
    if(absY > absX && dy > 30){
        moveDown();
        return;
    }
	
}

canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
canvas.addEventListener("touchend", handleTouchEnd, { passive: false });	

holdCanvas.addEventListener("touchstart", e => {

    e.preventDefault();

    if(!running || paused || matchEnded)
        return;

    hold();

}, { passive:false });

holdCanvas.addEventListener("click", () => {

    if(!running || paused || matchEnded)
        return;

    hold();
});

