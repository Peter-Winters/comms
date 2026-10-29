package expo.modules.webviewcookies

import android.webkit.CookieManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Reads cookies from the app's WebView, including HttpOnly ones that page JavaScript can't
// see. Used to capture the session cookies that some bridges (Instagram, Messenger) log in with.
class WebviewCookiesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WebviewCookies")

    Function("getCookies") { url: String ->
      CookieManager.getInstance().getCookie(url) ?: ""
    }

    Function("clearCookies") {
      CookieManager.getInstance().removeAllCookies(null)
      CookieManager.getInstance().flush()
    }
  }
}
