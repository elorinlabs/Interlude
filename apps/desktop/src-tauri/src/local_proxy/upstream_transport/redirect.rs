use super::{Bytes, Error, Request};
use reqwest::{header, Method, StatusCode, Url};

/// Streamed bodies are not cloneable by reqwest's redirect middleware. Keep the
/// original bytes here so standard HTTP redirects still work without retrying errors.
pub(super) struct Target {
    pub(super) method: Method,
    pub(super) url: Url,
    pub(super) headers: header::HeaderMap,
    pub(super) body: Bytes,
    followed: u32,
    max_redirects: u32,
}

impl Target {
    pub(super) fn new(request: &Request) -> Self {
        Self {
            method: request.method.clone(),
            url: request.url.clone(),
            headers: request.headers.clone(),
            body: request.body.clone(),
            followed: 0,
            max_redirects: request.max_redirects,
        }
    }

    pub(super) fn follow(&mut self, response: &reqwest::Response) -> Result<bool, Error> {
        let status = response.status();
        if self.max_redirects == 0 || !matches!(status.as_u16(), 301 | 302 | 303 | 307 | 308) {
            return Ok(false);
        }
        let next = response
            .headers()
            .get(header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|location| self.url.join(location).ok());
        let Some(next) = next else {
            return Ok(false);
        };
        if !matches!(next.scheme(), "http" | "https") {
            return Err(Error::RedirectScheme);
        }
        if self.followed >= self.max_redirects {
            return Err(Error::RedirectLimit(self.max_redirects));
        }
        if next.origin() != self.url.origin() {
            strip_credentials(&mut self.headers);
        }
        if matches!(
            status,
            StatusCode::MOVED_PERMANENTLY | StatusCode::FOUND | StatusCode::SEE_OTHER
        ) {
            self.body = Bytes::new();
            for name in [
                header::CONTENT_LENGTH,
                header::CONTENT_TYPE,
                header::CONTENT_ENCODING,
                header::TRANSFER_ENCODING,
            ] {
                self.headers.remove(name);
            }
            if self.method != Method::GET && self.method != Method::HEAD {
                self.method = Method::GET;
            }
        }
        self.url = next;
        self.followed += 1;
        Ok(true)
    }
}

fn strip_credentials(headers: &mut header::HeaderMap) {
    for name in [
        "authorization",
        "cookie",
        "cookie2",
        "proxy-authorization",
        "www-authenticate",
        "chatgpt-account-id",
        "x-api-key",
        "x-goog-api-key",
        "api-key",
        "openai-api-key",
    ] {
        headers.remove(name);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{thread, time::Duration};
    use tiny_http::{Header, Response, Server, StatusCode as HttpStatus};

    fn request(url: String) -> Request {
        let builder = reqwest::blocking::Client::new()
            .post(url)
            .bearer_auth("test-secret")
            .header("ChatGPT-Account-Id", "test-account")
            .header("x-goog-api-key", "google-test-secret")
            .body(vec![b'x'; 128 * 1024]);
        Request::prepare(builder).unwrap()
    }

    fn receive(server: &Server) -> tiny_http::Request {
        server
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap()
    }

    #[test]
    fn configured_redirect_count_is_copied_before_transport_dispatch() {
        for (limit, succeeds) in [(0, true), (1, false), (12, true)] {
            let server = Server::http("127.0.0.1:0").unwrap();
            let url = format!("http://{}/start", server.server_addr());
            let scope = crate::local_proxy::transport_settings::RequestScope::enter(
                crate::models::ProxyTransportSettings {
                    max_redirects: limit,
                    ..Default::default()
                },
            );
            let request = request(url);
            drop(scope);
            let worker = thread::spawn(move || {
                for index in 0..=limit.min(11) {
                    let mut request = receive(&server);
                    request.as_reader().read_to_end(&mut Vec::new()).unwrap();
                    let response = if index == 11 {
                        Response::empty(HttpStatus(200))
                    } else {
                        Response::empty(HttpStatus(302))
                            .with_header(Header::from_bytes("Location", "/next").unwrap())
                    };
                    request.respond(response).unwrap();
                }
            });
            let result = request.send();
            assert_eq!(result.is_ok(), succeeds);
            if limit == 0 {
                assert_eq!(result.unwrap().status(), 302);
            }
            worker.join().unwrap();
        }
    }

    #[test]
    fn preserving_redirects_replay_the_complete_body() {
        for status in [307, 308] {
            let server = Server::http("127.0.0.1:0").unwrap();
            let url = format!("http://{}/start", server.server_addr());
            let worker = thread::spawn(move || {
                let mut first = receive(&server);
                let mut bytes = Vec::new();
                first.as_reader().read_to_end(&mut bytes).unwrap();
                first
                    .respond(
                        Response::empty(HttpStatus(status))
                            .with_header(Header::from_bytes("Location", "/final").unwrap()),
                    )
                    .unwrap();
                let mut second = receive(&server);
                assert_eq!(second.url(), "/final");
                assert_eq!(second.method(), &tiny_http::Method::Post);
                let mut redirected = Vec::new();
                second.as_reader().read_to_end(&mut redirected).unwrap();
                assert_eq!(redirected, bytes);
                second.respond(Response::from_string("ok")).unwrap();
            });
            assert_eq!(request(url).send().unwrap().bytes().unwrap(), b"ok");
            worker.join().unwrap();
        }
    }

    #[test]
    fn cross_origin_redirect_removes_credentials_and_303_drops_the_body() {
        let first_server = Server::http("127.0.0.1:0").unwrap();
        let next_server = Server::http("127.0.0.1:0").unwrap();
        let url = format!("http://{}/start", first_server.server_addr());
        let next_url = format!("http://{}/final", next_server.server_addr());
        let worker = thread::spawn(move || {
            let mut first = receive(&first_server);
            first.as_reader().read_to_end(&mut Vec::new()).unwrap();
            first
                .respond(
                    Response::empty(HttpStatus(303))
                        .with_header(Header::from_bytes("Location", next_url).unwrap()),
                )
                .unwrap();
            let mut next = receive(&next_server);
            assert_eq!(next.method(), &tiny_http::Method::Get);
            assert!(!next.headers().iter().any(|header| {
                header.field.equiv("Authorization")
                    || header.field.equiv("ChatGPT-Account-Id")
                    || header.field.equiv("x-goog-api-key")
            }));
            let mut bytes = Vec::new();
            next.as_reader().read_to_end(&mut bytes).unwrap();
            assert!(bytes.is_empty());
            next.respond(Response::from_string("ok")).unwrap();
        });
        assert_eq!(request(url).send().unwrap().bytes().unwrap(), b"ok");
        worker.join().unwrap();
    }
}
