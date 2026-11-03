use hmac::{Hmac,Mac};
use zeroize::Zeroizing;
pub(super) struct Otp {pub(super) secret:String,pub(super) algorithm:String,pub(super) digits:u32,pub(super) period:u64}
impl Drop for Otp {fn drop(&mut self){use zeroize::Zeroize;self.secret.zeroize();}}
pub(super) fn parse(input:&str)->Result<Otp,String>{
    let mut result=Otp{secret:input.to_owned(),algorithm:"SHA1".into(),digits:6,period:30};
    if input.starts_with("otpauth://"){
        let url=url::Url::parse(input).map_err(|_|"savedLoginInvalid")?;
        if url.host_str()!=Some("totp"){return Err("savedLoginInvalid".into());}
        let params=|key:&str|url.query_pairs().find(|(k,_)|k==key).map(|(_,v)|v.into_owned());
        result.secret=params("secret").ok_or("savedLoginInvalid")?;
        result.algorithm=params("algorithm").unwrap_or("SHA1".into()).to_ascii_uppercase().replace('-',"");
        result.digits=params("digits").unwrap_or("6".into()).parse().map_err(|_|"savedLoginInvalid")?;
        result.period=params("period").unwrap_or("30".into()).parse().map_err(|_|"savedLoginInvalid")?;
    }
    result.secret=result.secret.chars().filter(|c|!c.is_whitespace()&&*c!='='&&*c!='-').collect::<String>().to_ascii_uppercase();
    let decoded=Zeroizing::new(data_encoding::BASE32_NOPAD.decode(result.secret.as_bytes()).map_err(|_|"savedLoginInvalid")?);
    if decoded.len()<10||decoded.len()>128||!matches!(result.algorithm.as_str(),"SHA1"|"SHA256"|"SHA512")
        ||!matches!(result.digits,6|8)||!(15..=120).contains(&result.period){return Err("savedLoginInvalid".into());}
    Ok(result)
}
pub(super) fn normalize(input:&str)->Result<String,String>{
    let otp=parse(input)?;
    let mut uri=url::Url::parse("otpauth://totp/Interlude").map_err(|_|"savedLoginInvalid")?;
    uri.query_pairs_mut().append_pair("secret",&otp.secret).append_pair("algorithm",&otp.algorithm)
        .append_pair("digits",&otp.digits.to_string()).append_pair("period",&otp.period.to_string());
    Ok(uri.to_string())
}
pub(super) fn generate(input:&str,seconds:u64)->Result<(String,u64),String>{
    let otp=parse(input)?;
    let bytes=Zeroizing::new(data_encoding::BASE32_NOPAD.decode(otp.secret.as_bytes()).map_err(|_|"savedLoginInvalid")?);
    let counter=(seconds/otp.period).to_be_bytes();
    macro_rules! digest {($hash:ty)=>{{let mut mac=Hmac::<$hash>::new_from_slice(&bytes).map_err(|_|"savedLoginInvalid")?;
        mac.update(&counter);mac.finalize().into_bytes().to_vec()}};}
    let digest=Zeroizing::new(match otp.algorithm.as_str(){"SHA256"=>digest!(sha2::Sha256),"SHA512"=>digest!(sha2::Sha512),_=>digest!(sha1::Sha1)});
    let offset=(digest[digest.len()-1]&15) as usize;
    let value=u32::from_be_bytes(digest[offset..offset+4].try_into().map_err(|_|"savedLoginInvalid")?)&0x7fffffff;
    Ok((format!("{:0width$}",value%10_u32.pow(otp.digits),width=otp.digits as usize),(seconds/otp.period+1)*otp.period*1000))
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn rfc6238_algorithms(){
        for (algorithm,key,expected) in [("SHA1",b"12345678901234567890".as_slice(),"94287082"),("SHA256",b"12345678901234567890123456789012".as_slice(),"46119246"),("SHA512",b"1234567890123456789012345678901234567890123456789012345678901234".as_slice(),"90693936")]{
            let uri=format!("otpauth://totp/test?secret={}&algorithm={algorithm}&digits=8",data_encoding::BASE32_NOPAD.encode(key));
            assert_eq!(generate(&uri,59).unwrap().0,expected);
        }
    }
    #[test]fn custom_period_expiry(){let uri="otpauth://totp/test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&period=60";assert_eq!(generate(uri,65).unwrap().1,120000);}
}
