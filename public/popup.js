// Utilitaires de cryptage/décryptage
async function getKey(pin) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  const key = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode('salt'),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return key;
}

async function encrypt(password, pin) {
  const key = await getKey(pin);
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(16)); // 16 bytes for AES-CBC
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-CBC", iv: iv },
    key,
    enc.encode(password)
  );
  return {
    iv: Array.from(iv),
    encrypted: Array.from(new Uint8Array(encrypted))
  };
}

async function decrypt(encryptedData, pin) {
  const key = await getKey(pin);
  const dec = new TextDecoder();
  const iv = new Uint8Array(encryptedData.iv);
  const encrypted = new Uint8Array(encryptedData.encrypted);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-CBC", iv: iv },
    key,
    encrypted
  );
  return dec.decode(decrypted);
}
document.addEventListener('DOMContentLoaded', function() {
  chrome.storage.local.get(['pin'], function(result) {
    if (result.pin) {
      document.getElementById('login').classList.remove('hidden');
    } else {
      document.getElementById('register').classList.remove('hidden');
    }
  });
});

document.getElementById('register-form').addEventListener('submit', function(event) {
  event.preventDefault();
  const newPin = document.getElementById('register-new-pin').value;
  const confirmPin = document.getElementById('register-confirm-pin').value;

  if (newPin !== confirmPin) {
    document.getElementById('register-messages').innerText = 'Les PINs ne correspondent pas !';
    return;
  }

  chrome.storage.local.set({ pin: newPin }, function() {
    document.getElementById('register-messages').innerText = 'PIN enregistré avec succès !';
    document.getElementById('register').classList.add('hidden');
    document.getElementById('login').classList.remove('hidden');
  });
});

document.getElementById('login-form').addEventListener('submit', function(event) {
  event.preventDefault();
  const pin = document.getElementById('pin').value;

  chrome.storage.local.get(['pin'], function(result) {
    if (pin === result.pin) {
      document.getElementById('login').classList.add('hidden');
      document.getElementById('password-manager').classList.remove('hidden');
      document.getElementById('password-manager').dataset.pin = pin;
    } else {
      document.getElementById('login-messages').innerText = 'PIN incorrect !';
    }
  });
});

document.getElementById('show-register').addEventListener('click', function() {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('register').classList.remove('hidden');
});

document.getElementById('password-form').addEventListener('submit', async function(event) {
  event.preventDefault();

  const service = document.getElementById('service').value;
  const password = document.getElementById('password').value;
  const pin = document.getElementById('password-manager').dataset.pin;

  const encryptedData = await encrypt(password, pin);

  chrome.storage.local.get([pin], function(result) {
    let passwords = result[pin] || {};
    passwords[service] = encryptedData;
    chrome.storage.local.set({ [pin]: passwords }, function() {
      document.getElementById('messages').innerText = 'Mot de passe enregistré avec succès !';
      document.getElementById('service').value = '';
      document.getElementById('password').value = '';
    });
  });
});

document.getElementById('show-passwords').addEventListener('click', async function() {
  await loadPasswords();
  document.getElementById('password-list').classList.toggle('hidden');
});

document.getElementById('logout').addEventListener('click', function() {
  document.getElementById('password-manager').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');
});

async function loadPasswords() {
  const pin = document.getElementById('password-manager').dataset.pin;
  chrome.storage.local.get([pin], async function(result) {
    const passwordList = document.getElementById('password-list');
    passwordList.innerHTML = '';
    const passwords = result[pin] || {};
    for (let [service, encryptedData] of Object.entries(passwords)) {
      const listItem = document.createElement('div');
      listItem.innerHTML = `Service: ${service} <button class="show" data-service="${service}">Afficher</button> <button class="delete" data-service="${service}">Supprimer</button>`;
      passwordList.appendChild(listItem);
    }
    document.querySelectorAll('.show').forEach(button => {
      button.addEventListener('click', function() {
        const serviceToShow = this.getAttribute('data-service');
        document.getElementById('password-manager').classList.add('hidden');
        document.getElementById('show-password').classList.remove('hidden');
        document.getElementById('show-password').dataset.service = serviceToShow;
      });
    });
    document.querySelectorAll('.delete').forEach(button => {
      button.addEventListener('click', function() {
        const serviceToDelete = this.getAttribute('data-service');
        delete passwords[serviceToDelete];
        chrome.storage.local.set({ [pin]: passwords }, function() {
          loadPasswords();
        });
      });
    });
  });
}

document.getElementById('show-password-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const pin = document.getElementById('show-pin').value;
  const service = document.getElementById('show-password').dataset.service;
  const storedPin = document.getElementById('password-manager').dataset.pin;

  if (pin === storedPin) {
    chrome.storage.local.get([storedPin], async function(result) {
      const encryptedData = result[storedPin][service];
      try {
        const password = await decrypt(encryptedData, pin);
        document.getElementById('password-display').innerText = `Mot de passe pour ${service}: ${password}`;
      } catch (e) {
        document.getElementById('show-password-messages').innerText = 'Erreur de décryptage !';
      }
    });
  } else {
    document.getElementById('show-password-messages').innerText = 'PIN incorrect !';
  }
});

document.getElementById('back-to-list').addEventListener('click', function() {
  document.getElementById('show-password').classList.add('hidden');
  document.getElementById('password-manager').classList.remove('hidden');
  document.getElementById('show-password-form').reset();
  document.getElementById('password-display').innerText = '';
  document.getElementById('show-password-messages').innerText = '';
});
