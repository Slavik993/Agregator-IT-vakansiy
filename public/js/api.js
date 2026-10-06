// REST-клиент: единая точка входа, хранит JWT, делает fetch.
// Все ошибки выбрасываются как Error с понятным текстом.

const api = (() => {
  const TOKEN_KEY = 'agregator_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(data?.error || res.statusText || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    // ---- auth ----
    register: (payload) => request('POST', '/api/auth/register', payload),
    login: (payload) => request('POST', '/api/auth/login', payload),
    logout: () => request('POST', '/api/auth/logout', {}),
    verifyEmail: (email, code) => request('POST', '/api/auth/verify-email', { email, code }),
    resendCode: (email) => request('POST', '/api/auth/resend-code', { email }),
    me: () => request('GET', '/api/me'),

    // ---- profile ----
    getMyProfile: () => request('GET', '/api/me/candidate/profile'),
    updateMyProfile: (payload) => request('PUT', '/api/me/candidate/profile', payload),
    updatePrivacy: (payload) => request('PUT', '/api/me/privacy', payload),
    linkFsp: (fsp_id) => request('POST', '/api/me/fsp-link', { fsp_id }),

    // ---- employer ----
    getCompany: () => request('GET', '/api/me/employer/company'),
    updateCompany: (payload) => request('PUT', '/api/me/employer/company', payload),

    // ---- candidates / search ----
    searchCandidates: (params) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params || {})) {
        if (v !== null && v !== undefined && v !== '') q.set(k, v);
      }
      return request('GET', `/api/candidates/search?${q.toString()}`);
    },
    getCandidateCategory: (id) => request('GET', `/api/candidates/${id}/category`),
    getCandidatePdfUrl: (id) => `/api/candidates/${id}/pdf`,

    // ---- vacancies ----
    getVacancies: () => request('GET', '/api/vacancies'),
    getVacancy: (id) => request('GET', `/api/vacancies/${id}`),
    createVacancy: (payload) => request('POST', '/api/vacancies', payload),
    updateVacancy: (id, payload) => {
      const headers = { 'Content-Type': 'application/json' };
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return fetch(`/api/vacancies/${id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) }).then(r => r.json());
    },
    getVacancyMatches: (id) => request('GET', `/api/vacancies/${id}/matches`),
    reportVacancy: (id, payload) => request('POST', `/api/vacancies/${id}/report`, payload),

    // ---- testing ----
    getTestingMeta: () => request('GET', '/api/testing/meta'),
    startTest: (candidateId, payload) => request('POST', `/api/candidates/${candidateId}/tests`, payload),
    submitTest: (attemptId, answers) => request('POST', `/api/test-attempts/${attemptId}/submit`, { answers }),
    getCandidateTests: (id) => request('GET', `/api/candidates/${id}/tests`),
    getGradeChangeStatus: (id) => request('GET', `/api/candidates/${id}/grade-change-status`),

    // ---- offers / applications / tasks ----
    getOffers: () => request('GET', '/api/offers'),
    createOffer: (payload) => request('POST', '/api/offers', payload),
    updateOffer: (id, payload) => request('PATCH', `/api/offers/${id}`, payload),
    getOfferContact: (id) => request('GET', `/api/offers/${id}/contact`),
    getApplications: () => request('GET', '/api/applications'),
    createApplication: (payload) => request('POST', '/api/applications', payload),
    updateApplication: (id, payload) => request('PATCH', `/api/applications/${id}`, payload),
    getTasks: () => request('GET', '/api/tasks'),
    createTask: (payload) => request('POST', '/api/tasks', payload),
    submitTask: (id, payload) => request('POST', `/api/tasks/${id}/submit`, payload),
    reviewTask: (id, payload) => request('POST', `/api/tasks/${id}/review`, payload),

    // ---- fsp ----
    getFspDisciplines: () => request('GET', '/api/fsp/disciplines'),

    // token helpers
    getToken,
    setToken,
  };
})();