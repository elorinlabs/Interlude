//! Loopback callback validation and branded, offline completion pages.
use tiny_http::{Header,Request,Response,StatusCode};

pub(crate) fn valid_request(method:&str,remote:Option<std::net::IpAddr>,url:&str)->bool{
    method=="GET"&&remote.is_some_and(|ip|ip.is_loopback())&&url.starts_with('/')&&!url.starts_with("//")
}
pub(crate) fn parameters(url:&url::Url)->Result<std::collections::HashMap<String,String>,()>{
    let mut values=std::collections::HashMap::new();
    for (key,value) in url.query_pairs(){if values.insert(key.into_owned(),value.into_owned()).is_some(){return Err(());}}
    Ok(values)
}
fn escape(value:&str)->String{value.replace('&',"&amp;").replace('<',"&lt;").replace('>',"&gt;")}
pub(crate) fn page(title:&str,message:&str)->String{
    let copy=crate::storage::callback_page_copy(title,message);
    let lang=copy.lang;let title=escape(&copy.title);let message=escape(&copy.message);
    let logo=include_str!("../../public/interlude-logo.svg");
    format!(r#"<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} · Interlude</title><style>
    :root{{font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif;color:#302d4b;background:#f4f2fc}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at 15% 10%,#e6dcff,transparent 65%),radial-gradient(ellipse at 90% 90%,#d9f1fc,transparent 65%)}}main{{box-sizing:border-box;width:min(420px,calc(100% - 40px));padding:38px 30px;text-align:center;border:1px solid #fff;border-radius:24px;background:#ffffffa8;box-shadow:0 22px 70px #50448515}}.mark svg{{width:64px;height:64px}}.brand{{font-size:13px;letter-spacing:.05em;color:#776e95;margin:14px 0 24px}}h1{{font-size:23px;font-weight:600;letter-spacing:-.03em;margin:0 0 14px}}p{{font-size:14px;color:#716b83;line-height:1.7;overflow-wrap:anywhere;margin:0}}footer{{margin-top:26px;font-size:11px;color:#9a93ab}}</style></head><body><main><div class="mark">{logo}</div><div class="brand">Interlude</div><h1>{title}</h1><p>{message}</p><footer>Interlude</footer></main></body></html>"#)
}
pub(crate) fn respond(request:Request,status:u16,title:&str,message:&str){
    let mut response=Response::from_string(page(title,message)).with_status_code(StatusCode(status));
    for (key,value) in [("Content-Type","text/html; charset=utf-8"),("Cache-Control","no-store"),("Referrer-Policy","no-referrer"),("X-Content-Type-Options","nosniff"),
        ("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")]{
        if let Ok(header)=Header::from_bytes(key,value){response=response.with_header(header);}
    }
    // The browser may close immediately after authorization; credentials were already handled.
    let _=request.respond(response);
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn callback_rejects_non_get_and_non_loopback(){
        assert!(valid_request("GET",Some("127.0.0.1".parse().unwrap()),"/auth/callback"));
        assert!(!valid_request("POST",Some("127.0.0.1".parse().unwrap()),"/auth/callback"));
        assert!(!valid_request("GET",Some("10.0.0.1".parse().unwrap()),"/auth/callback"));
    }
    #[test]fn duplicate_oauth_parameters_are_rejected(){assert!(parameters(&url::Url::parse("http://localhost/auth/callback?state=a&state=b").unwrap()).is_err());}
    #[test]fn branded_page_is_offline_and_escapes_provider_text(){
        let html=page("登录成功","<&script>");assert!(html.contains("Interlude"));assert!(!html.contains("Remote AI"));assert!(!html.contains("RemoteAI"));
        assert!(html.contains("&lt;&amp;script&gt;"));assert!(!html.contains("<script>"));
    }
    #[test]fn callback_preview_fixture(){
        if let Ok(path)=std::env::var("INTERLUDE_CALLBACK_PREVIEW"){
            std::fs::write(path,page("登录成功","账户已保存。请回到 Interlude 手动切换到此账户。")).unwrap();
        }
    }
}
