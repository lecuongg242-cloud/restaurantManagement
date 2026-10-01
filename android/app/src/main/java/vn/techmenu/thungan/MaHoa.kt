package vn.techmenu.thungan

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Mã hóa mật khẩu tài khoản `printer` bằng khóa trong Android Keystore (thay `safeStorage`/DPAPI của app Windows).
 * Khóa không rời vùng bảo mật của máy ⇒ chép bộ nhớ app sang máy khác cũng không đọc được mật khẩu.
 */
object MaHoa {
    private const val BI_DANH = "techmenu-printer"
    private const val KIEU = "AES/GCM/NoPadding"

    private fun khoa(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(BI_DANH, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(BI_DANH, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        )
        return gen.generateKey()
    }

    fun maHoa(chu: String): String {
        val c = Cipher.getInstance(KIEU).apply { init(Cipher.ENCRYPT_MODE, khoa()) }
        val ma = c.doFinal(chu.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(c.iv + ma, Base64.NO_WRAP)
    }

    fun giaiMa(chuoi: String): String? = try {
        val b = Base64.decode(chuoi, Base64.NO_WRAP)
        val c = Cipher.getInstance(KIEU).apply { init(Cipher.DECRYPT_MODE, khoa(), GCMParameterSpec(128, b, 0, 12)) }
        String(c.doFinal(b, 12, b.size - 12), Charsets.UTF_8)
    } catch (_: Exception) {
        null
    }
}
