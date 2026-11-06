(() => {
  if (location.origin !== 'https://auth.openai.com' || window.top !== window) return;
  if (window.__interludeRecoveryStarted) return;
  window.__interludeRecoveryStarted = true;
  const secret = __INTERLUDE_SECRET__;
  let attempts = 0;
  let submittedAt = 0;
  let reportedAuthenticator = false;
  const seen = new Set();
  const filled = new WeakMap();
  const timer = setInterval(() => {
    if (location.origin !== 'https://auth.openai.com') { clearInterval(timer); return; }
    const visible = el => el && el.getClientRects().length && !el.disabled;
    if (++attempts > 120 || [...document.querySelectorAll('iframe')].some(el => visible(el) && /captcha|challenges\.cloudflare/.test(el.src))) {
      clearInterval(timer); location.href = 'interlude-recovery://takeover'; return;
    }
    const password = document.querySelector('input[type="password"]');
    const email = document.querySelector('input[type="email"],input[name="username"]');
    const authenticator = /authenticator|验证器|驗證器/i.test(document.body.innerText);
    if (authenticator && !reportedAuthenticator) {
      reportedAuthenticator = true;
      location.href = 'interlude-recovery://progress/totpPage';
      return;
    }
    const otp = document.querySelector('input[autocomplete="one-time-code"],input[name="code"],input[name="otp"],input[name="verificationCode"]')
      || (authenticator ? document.querySelector('input[inputmode="numeric"],input[autocomplete="off"][type="text"]') : null);
    if (visible(otp) && authenticator && Date.now() >= secret.expiresAt) {
      clearInterval(timer); window.__interludeRecoveryStarted = false;
      location.href = 'interlude-recovery://refresh'; return;
    }
    let input, value, stage;
    if (visible(password)) { input=password;value=secret.password;stage='password'; }
    else if (visible(email)) { input=email;value=secret.email;stage='email'; }
    else if (visible(otp) && authenticator && Date.now() < secret.expiresAt) { input=otp;value=secret.code;stage='totp'; }
    else return;
    if (seen.has(stage)) {
      if (Date.now() - submittedAt >= 20000) {
        clearInterval(timer); location.href = 'interlude-recovery://takeover';
      }
      return;
    }
    if (filled.get(input) !== stage) {
      filled.set(input, stage);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
      location.href = `interlude-recovery://progress/${stage}`;
    }
    const form=input.closest('form');
    const submit=form?.querySelector('button[type="submit"],input[type="submit"]');
    if (!visible(submit)) return;
    seen.add(stage);
    submittedAt = Date.now();
    submit.click();
  },500);
  setTimeout(()=>clearInterval(timer),61000);
})();
