//! Nạp `WebView2Loader.dll` tại runtime thay vì lúc khởi động process.
//!
//! Lý do: bản build GNU link động vào WebView2Loader.dll, nên nếu file này không
//! nằm cạnh exe thì Windows không cho app chạy — mâu thuẫn với yêu cầu "1 file exe".
//! Ở đây ta tự định nghĩa đúng 5 hàm xuất của loader; linker thấy symbol đã có nên
//! không kéo import library nữa, exe không còn phụ thuộc DLL lúc load. Khi WebView2
//! thực sự cần, ta giải nén DLL từ trong exe rồi `LoadLibraryW` đường dẫn đầy đủ.

use std::ffi::c_void;
use std::sync::OnceLock;

const E_FAIL: i32 = 0x8000_4005u32 as i32;

#[link(name = "kernel32")]
extern "system" {
    fn LoadLibraryW(name: *const u16) -> *mut c_void;
    fn GetProcAddress(module: *mut c_void, name: *const u8) -> *mut c_void;
}

static MODULE: OnceLock<usize> = OnceLock::new();

fn module() -> usize {
    *MODULE.get_or_init(|| {
        let Ok(path) = crate::assets::ensure_webview2_dll() else {
            return 0;
        };
        let mut wide: Vec<u16> = path.to_string_lossy().encode_utf16().collect();
        wide.push(0);
        unsafe { LoadLibraryW(wide.as_ptr()) as usize }
    })
}

/// Con trỏ hàm trong DLL (null nếu không nạp được).
unsafe fn proc(name: &'static [u8]) -> *mut c_void {
    let m = module();
    if m == 0 {
        return std::ptr::null_mut();
    }
    GetProcAddress(m as *mut c_void, name.as_ptr())
}

#[export_name = "CompareBrowserVersions"]
pub extern "system" fn compare_browser_versions(
    version1: *const u16,
    version2: *const u16,
    result: *mut i32,
) -> i32 {
    type F = unsafe extern "system" fn(*const u16, *const u16, *mut i32) -> i32;
    unsafe {
        let p = proc(b"CompareBrowserVersions\0");
        if p.is_null() {
            return E_FAIL;
        }
        let f: F = std::mem::transmute(p);
        f(version1, version2, result)
    }
}

#[export_name = "CreateCoreWebView2Environment"]
pub extern "system" fn create_core_webview2_environment(handler: *mut c_void) -> i32 {
    type F = unsafe extern "system" fn(*mut c_void) -> i32;
    unsafe {
        let p = proc(b"CreateCoreWebView2Environment\0");
        if p.is_null() {
            return E_FAIL;
        }
        let f: F = std::mem::transmute(p);
        f(handler)
    }
}

#[export_name = "CreateCoreWebView2EnvironmentWithOptions"]
pub extern "system" fn create_core_webview2_environment_with_options(
    browser_executable_folder: *const u16,
    user_data_folder: *const u16,
    environment_options: *mut c_void,
    handler: *mut c_void,
) -> i32 {
    type F = unsafe extern "system" fn(*const u16, *const u16, *mut c_void, *mut c_void) -> i32;
    unsafe {
        let p = proc(b"CreateCoreWebView2EnvironmentWithOptions\0");
        if p.is_null() {
            return E_FAIL;
        }
        let f: F = std::mem::transmute(p);
        f(browser_executable_folder, user_data_folder, environment_options, handler)
    }
}

#[export_name = "GetAvailableCoreWebView2BrowserVersionString"]
pub extern "system" fn get_available_core_webview2_browser_version_string(
    browser_executable_folder: *const u16,
    version_info: *mut *mut u16,
) -> i32 {
    type F = unsafe extern "system" fn(*const u16, *mut *mut u16) -> i32;
    unsafe {
        let p = proc(b"GetAvailableCoreWebView2BrowserVersionString\0");
        if p.is_null() {
            return E_FAIL;
        }
        let f: F = std::mem::transmute(p);
        f(browser_executable_folder, version_info)
    }
}

#[export_name = "GetAvailableCoreWebView2BrowserVersionStringWithOptions"]
pub extern "system" fn get_available_core_webview2_browser_version_string_with_options(
    browser_executable_folder: *const u16,
    environment_options: *mut c_void,
    version_info: *mut *mut u16,
) -> i32 {
    type F = unsafe extern "system" fn(*const u16, *mut c_void, *mut *mut u16) -> i32;
    unsafe {
        let p = proc(b"GetAvailableCoreWebView2BrowserVersionStringWithOptions\0");
        if p.is_null() {
            return E_FAIL;
        }
        let f: F = std::mem::transmute(p);
        f(browser_executable_folder, environment_options, version_info)
    }
}
