package kz.degirmen.guard;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** После включения планшета или обновления приложения защита стартует сама. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        try { if (Api.paired(c)) TrackService.start(c); } catch (Exception ignored) { }
    }
}
