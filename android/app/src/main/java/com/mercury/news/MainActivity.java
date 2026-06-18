package com.mercury.news;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.splashscreen.SplashScreen;

public class MainActivity extends AppCompatActivity {

    private WebView mWebView;
    private boolean mPageLoaded = false;
    // Replace with your active Firebase Hosting URL
    private static final String TARGET_URL = "https://caledonian-mercury-app.web.app";
    // Dev fallback: local network dev server
    private static final String DEV_URL = "http://10.0.2.2:8000"; // emulator localhost loopback

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Install AndroidX SplashScreen API before super.onCreate()
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);

        super.onCreate(savedInstanceState);

        // Keep native splash visible until WebView finishes rendering
        splashScreen.setKeepOnScreenCondition(() -> !mPageLoaded);

        // Programmatically generate WebView layout for lightweight footprint
        mWebView = new WebView(this);
        setContentView(mWebView);

        WebSettings webSettings = mWebView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true); // Critical for LocalStorage & Firebase Auth
        webSettings.setDatabaseEnabled(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webSettings.setSupportZoom(false);
        webSettings.setBuiltInZoomControls(false);

        // Hide scrollbars for slick fullscreen TikTok look
        mWebView.setHorizontalScrollBarEnabled(false);
        mWebView.setVerticalScrollBarEnabled(false);
        mWebView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Prevent opening external browser
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                mPageLoaded = true;
            }
        });

        // Safety fallback: dismiss native splash after 4 seconds regardless of load state
        mWebView.postDelayed(() -> mPageLoaded = true, 4000);

        // Load targeted application
        mWebView.loadUrl(TARGET_URL);
    }

    @Override
    public void onBackPressed() {
        if (mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
