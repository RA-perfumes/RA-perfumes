const phoneAuth = {
  projectUrl: '',
  publishableKey: '',
  get enabled() { return Boolean(this.projectUrl && this.publishableKey); },
  async request(path, payload, token) {
    const headers = {apikey: this.publishableKey, 'Content-Type': 'application/json'};
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(this.projectUrl + '/auth/v1/' + path, {
      method: payload ? 'POST' : 'GET', headers,
      body: payload ? JSON.stringify(payload) : undefined
    });
    if (!response.ok) throw new Error('Verification unavailable');
    return response.json();
  }
};