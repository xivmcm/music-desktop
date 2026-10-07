package com.xivmcm.glassplayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

public class GlassMediaActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GlassPlayer:ActionReceiverWakeLock");
                wakeLock.acquire(15000); // 15 seconds guarantee for network stream resolution and audio element start
            }
        } catch (Exception ignored) {}
        GlassMediaPlugin.dispatchAction(intent.getAction());
    }
}
