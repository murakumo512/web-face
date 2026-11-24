package id.my.labjaringanukdw.wajah;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            View webView = getBridge().getWebView();
            ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
                int bottom = Math.max(bars.bottom, ime.bottom);

                ViewGroup.LayoutParams rawLp = v.getLayoutParams();
                if (rawLp instanceof ViewGroup.MarginLayoutParams) {
                    ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) rawLp;
                    if (
                        lp.leftMargin != bars.left ||
                        lp.topMargin != bars.top ||
                        lp.rightMargin != bars.right ||
                        lp.bottomMargin != bottom
                    ) {
                        lp.setMargins(bars.left, bars.top, bars.right, bottom);
                        v.setLayoutParams(lp);
                    }
                }
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(webView);
        }
    }
}
