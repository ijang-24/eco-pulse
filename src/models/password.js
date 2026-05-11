const crypto = require('crypto');

const HASH_PREFIX = 'scrypt';
const KEY_LENGTH = 64;

function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');

        crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(`${HASH_PREFIX}$${salt}$${derivedKey.toString('hex')}`);
        });
    });
}

function verifyHashedPassword(password, storedPassword) {
    return new Promise((resolve, reject) => {
        const parts = storedPassword.split('$');

        if (parts.length !== 3 || parts[0] !== HASH_PREFIX) {
            resolve(false);
            return;
        }

        const [, salt, storedKey] = parts;

        crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
            if (err) {
                reject(err);
                return;
            }

            const storedBuffer = Buffer.from(storedKey, 'hex');
            const derivedBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');

            if (storedBuffer.length !== derivedBuffer.length) {
                resolve(false);
                return;
            }

            resolve(crypto.timingSafeEqual(storedBuffer, derivedBuffer));
        });
    });
}

function isPasswordHashed(password) {
    return typeof password === 'string' && password.startsWith(`${HASH_PREFIX}$`);
}

module.exports = {
    hashPassword,
    verifyHashedPassword,
    isPasswordHashed
};
