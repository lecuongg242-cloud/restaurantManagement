plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Máy chủ cài lúc build (như app Windows): production, ghi đè bằng TECHMENU_API_BASE cho bản thử.
val apiBase = (System.getenv("TECHMENU_API_BASE") ?: "https://restaurant-management-zeta.vercel.app").trimEnd('/')

android {
    namespace = "vn.techmenu.thungan"
    compileSdk = 35

    defaultConfig {
        applicationId = "vn.techmenu.thungan" // QD-030 D6 — không đổi được sau khi phát hành
        minSdk = 26
        targetSdk = 35
        // Phiên bản do script phát hành truyền vào (android/scripts/phat-hanh.mjs); build tay = 1.0.0.
        versionCode = (System.getenv("TECHMENU_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("TECHMENU_VERSION_NAME") ?: "1.0.0"
        buildConfigField("String", "API_BASE", "\"$apiBase\"")
        // Nguồn tự cập nhật — mặc định chính máy chủ app; bản THỬ trỏ máy chủ cục bộ (TECHMENU_UPDATE_BASE).
        buildConfigField("String", "CAP_NHAT_BASE", "\"${System.getenv("TECHMENU_UPDATE_BASE")?.trimEnd('/') ?: apiBase}\"")
        buildConfigField("long", "YEN_TOI_THIEU_GIAY", "${System.getenv("TECHMENU_YEN_GIAY") ?: "300"}L")
    }

    // Khóa ký bản phát hành (24-02): tệp + mật khẩu qua biến môi trường, KHÔNG nằm trong repo.
    signingConfigs {
        create("release") {
            System.getenv("TECHMENU_KEYSTORE")?.let { storeFile = file(it) }
            storePassword = System.getenv("TECHMENU_KEYSTORE_PASS")
            keyAlias = System.getenv("TECHMENU_KEY_ALIAS") ?: "techmenu"
            keyPassword = System.getenv("TECHMENU_KEY_PASS") ?: System.getenv("TECHMENU_KEYSTORE_PASS")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            if (System.getenv("TECHMENU_KEYSTORE") != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    // Hai app cùng một dự án (P30, QD-033 D6): Thu ngân GIỮ NGUYÊN mã gói (QD-030 D6 — máy đang cài phải lên được bản
    // mới) và "TechMenu Quản lý" cho điện thoại chủ quán. Code dùng chung ở src/main; manifest + tên + biểu tượng riêng
    // ở src/thuNgan, src/quanLy. Tự cập nhật đọc tệp chỉ mục của đúng app (`?app=`), tên tệp theo tiền tố riêng.
    flavorDimensions += "app"
    productFlavors {
        create("thuNgan") {
            dimension = "app"
            applicationId = "vn.techmenu.thungan"
            buildConfigField("String", "APP_CAP_NHAT", "\"thu-ngan\"")
            buildConfigField("String", "TIEN_TO_TEP", "\"TechMenu-ThuNgan\"")
        }
        create("quanLy") {
            dimension = "app"
            applicationId = "vn.techmenu.quanly"
            buildConfigField("String", "APP_CAP_NHAT", "\"quan-ly\"")
            buildConfigField("String", "TIEN_TO_TEP", "\"TechMenu-QuanLy\"")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // Trang của app (đăng nhập, cài đặt máy in, mất mạng) là CHÍNH trang của app Windows — một nguồn cho hai app.
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/trang-assets"))
}

val chepTrang by tasks.registering(Copy::class) {
    from(rootProject.file("../desktop/trang"))
    into(layout.buildDirectory.dir("generated/trang-assets/trang"))
}
tasks.named("preBuild") { dependsOn(chepTrang) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.webkit:webkit:1.12.1")

    // Test JVM (EscPosTest): org.json của Android chỉ là bản rỗng khi chạy ngoài máy ⇒ dùng bản thật.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
