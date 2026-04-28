'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  apiRequest,
  Audiobook,
  AuthSession,
  FilterAction,
  FilterCategory,
  FilterTag,
  formatDuration,
  login,
  msToSeconds,
  register,
  secondsToMs,
  TranscriptSegment,
} from '@/lib/api';

const CATEGORY_OPTIONS: FilterCategory[] = [
  'profanity',
  'sexual_content',
  'violence',
  'substance_use',
  'religious_profanity',
];
const ACTION_OPTIONS: FilterAction[] = ['mute', 'skip', 'bleep'];

type BookForm = {
  title: string;
  author: string;
  durationSeconds: string;
  coverImageUrl: string;
  status: Audiobook['status'];
};

const emptyBookForm: BookForm = {
  title: '',
  author: '',
  durationSeconds: '0',
  coverImageUrl: '',
  status: 'processing',
};

export default function AdminPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [books, setBooks] = useState<Audiobook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [filterTags, setFilterTags] = useState<FilterTag[]>([]);
  const [bookForm, setBookForm] = useState<BookForm>(emptyBookForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const selectedBook = useMemo(
    () => books.find((book) => book._id === selectedBookId),
    [books, selectedBookId],
  );

  const token = session?.token;

  const showMessage = (value: string) => {
    setMessage(value);
    setError('');
  };

  const showError = (value: unknown) => {
    setError(value instanceof Error ? value.message : 'Something went wrong');
    setMessage('');
  };

  const loadBooks = useCallback(async () => {
    if (!token) return;
    const nextBooks = await apiRequest<Audiobook[]>('/audiobooks', token);
    setBooks(nextBooks);
    setSelectedBookId((current) => current || nextBooks[0]?._id || '');
  }, [token]);

  const loadBookDetails = useCallback(async () => {
    if (!token || !selectedBookId) {
      setSegments([]);
      setFilterTags([]);
      return;
    }
    const [nextSegments, nextTags] = await Promise.all([
      apiRequest<TranscriptSegment[]>(`/audiobooks/${selectedBookId}/transcript`, token),
      apiRequest<FilterTag[]>(`/audiobooks/${selectedBookId}/filter-tags`, token),
    ]);
    setSegments(nextSegments);
    setFilterTags(nextTags);
  }, [selectedBookId, token]);

  useEffect(() => {
    const stored = window.localStorage.getItem('ezlisten-admin-session');
    if (stored) setSession(JSON.parse(stored) as AuthSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    window.localStorage.setItem('ezlisten-admin-session', JSON.stringify(session));
    loadBooks().catch(showError);
  }, [loadBooks, session]);

  useEffect(() => {
    loadBookDetails().catch(showError);
  }, [loadBookDetails]);

  useEffect(() => {
    if (!selectedBook) {
      setBookForm(emptyBookForm);
      return;
    }
    setBookForm({
      title: selectedBook.title,
      author: selectedBook.author,
      durationSeconds: msToSeconds(selectedBook.durationMs),
      coverImageUrl: selectedBook.coverImageUrl,
      status: selectedBook.status,
    });
  }, [selectedBook]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    setIsBusy(true);
    try {
      const nextSession =
        authMode === 'login' ? await login(email, password) : await register(email, password);
      setSession(nextSession);
      showMessage(`Signed in as ${nextSession.email}`);
    } catch (err) {
      showError(err);
    } finally {
      setIsBusy(false);
    }
  }

  function signOut() {
    window.localStorage.removeItem('ezlisten-admin-session');
    setSession(null);
    setBooks([]);
    setSelectedBookId('');
    setSegments([]);
    setFilterTags([]);
    showMessage('Signed out');
  }

  async function uploadBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setIsBusy(true);
    try {
      const book = await apiRequest<Audiobook>('/audiobooks/upload', token, {
        method: 'POST',
        body: data,
      });
      setBooks((current) => [book, ...current]);
      setSelectedBookId(book._id);
      form.reset();
      showMessage('Audio uploaded and queued for processing');
    } catch (err) {
      showError(err);
    } finally {
      setIsBusy(false);
    }
  }

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedBook) return;
    setIsBusy(true);
    try {
      const book = await apiRequest<Audiobook>(`/audiobooks/${selectedBook._id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          title: bookForm.title,
          author: bookForm.author,
          durationMs: secondsToMs(bookForm.durationSeconds),
          coverImageUrl: bookForm.coverImageUrl,
          status: bookForm.status,
        }),
      });
      setBooks((current) => current.map((item) => (item._id === book._id ? book : item)));
      showMessage('Book metadata saved');
    } catch (err) {
      showError(err);
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteBook() {
    if (!token || !selectedBook || !window.confirm(`Delete "${selectedBook.title}"?`)) return;
    setIsBusy(true);
    try {
      await apiRequest<void>(`/audiobooks/${selectedBook._id}`, token, { method: 'DELETE' });
      setBooks((current) => current.filter((book) => book._id !== selectedBook._id));
      setSelectedBookId('');
      showMessage('Book deleted');
    } catch (err) {
      showError(err);
    } finally {
      setIsBusy(false);
    }
  }

  async function createSegment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedBook) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const segment = await apiRequest<TranscriptSegment>(
        `/audiobooks/${selectedBook._id}/transcript`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            startMs: secondsToMs(String(data.get('startSeconds') ?? '0')),
            endMs: secondsToMs(String(data.get('endSeconds') ?? '0')),
            text: String(data.get('text') ?? ''),
          }),
        },
      );
      setSegments((current) => [...current, segment].sort((a, b) => a.startMs - b.startMs));
      form.reset();
      showMessage('Transcript segment added');
    } catch (err) {
      showError(err);
    }
  }

  async function updateSegment(event: FormEvent<HTMLFormElement>, segmentId: string) {
    event.preventDefault();
    if (!token || !selectedBook) return;
    const data = new FormData(event.currentTarget);
    try {
      const segment = await apiRequest<TranscriptSegment>(
        `/audiobooks/${selectedBook._id}/transcript/${segmentId}`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({
            startMs: secondsToMs(String(data.get('startSeconds') ?? '0')),
            endMs: secondsToMs(String(data.get('endSeconds') ?? '0')),
            text: String(data.get('text') ?? ''),
          }),
        },
      );
      setSegments((current) =>
        current.map((item) => (item._id === segment._id ? segment : item)).sort((a, b) => a.startMs - b.startMs),
      );
      showMessage('Transcript segment saved');
    } catch (err) {
      showError(err);
    }
  }

  async function deleteSegment(segmentId: string) {
    if (!token || !selectedBook) return;
    try {
      await apiRequest<void>(`/audiobooks/${selectedBook._id}/transcript/${segmentId}`, token, {
        method: 'DELETE',
      });
      setSegments((current) => current.filter((segment) => segment._id !== segmentId));
      showMessage('Transcript segment deleted');
    } catch (err) {
      showError(err);
    }
  }

  async function createFilterTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedBook) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const tag = await apiRequest<FilterTag>(`/audiobooks/${selectedBook._id}/filter-tags`, token, {
        method: 'POST',
        body: JSON.stringify({
          category: data.get('category'),
          action: data.get('action'),
          severity: Number(data.get('severity')),
          startMs: secondsToMs(String(data.get('startSeconds') ?? '0')),
          endMs: secondsToMs(String(data.get('endSeconds') ?? '0')),
          originalText: String(data.get('originalText') ?? ''),
          replacementText: String(data.get('replacementText') ?? ''),
        }),
      });
      setFilterTags((current) => [...current, tag].sort((a, b) => a.startMs - b.startMs));
      form.reset();
      showMessage('Filter tag added');
    } catch (err) {
      showError(err);
    }
  }

  async function updateFilterTag(event: FormEvent<HTMLFormElement>, tagId: string) {
    event.preventDefault();
    if (!token || !selectedBook) return;
    const data = new FormData(event.currentTarget);
    try {
      const tag = await apiRequest<FilterTag>(
        `/audiobooks/${selectedBook._id}/filter-tags/${tagId}`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({
            category: data.get('category'),
            action: data.get('action'),
            severity: Number(data.get('severity')),
            startMs: secondsToMs(String(data.get('startSeconds') ?? '0')),
            endMs: secondsToMs(String(data.get('endSeconds') ?? '0')),
            originalText: String(data.get('originalText') ?? ''),
            replacementText: String(data.get('replacementText') ?? ''),
          }),
        },
      );
      setFilterTags((current) =>
        current.map((item) => (item._id === tag._id ? tag : item)).sort((a, b) => a.startMs - b.startMs),
      );
      showMessage('Filter tag saved');
    } catch (err) {
      showError(err);
    }
  }

  async function deleteFilterTag(tagId: string) {
    if (!token || !selectedBook) return;
    try {
      await apiRequest<void>(`/audiobooks/${selectedBook._id}/filter-tags/${tagId}`, token, {
        method: 'DELETE',
      });
      setFilterTags((current) => current.filter((tag) => tag._id !== tagId));
      showMessage('Filter tag deleted');
    } catch (err) {
      showError(err);
    }
  }

  if (!session) {
    return (
      <main className="app-shell">
        <section className="topbar">
          <div>
            <h1>Ezlisten Admin</h1>
            <p>Manage audio uploads, transcript timestamps, and content filter tags.</p>
          </div>
        </section>
        <section className="panel" style={{ maxWidth: 480 }}>
          <h2>{authMode === 'login' ? 'Sign in' : 'Create admin user'}</h2>
          <form className="form-grid" onSubmit={handleAuth}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" minLength={8} required />
            </label>
            <button disabled={isBusy}>{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
            <button
              className="secondary"
              type="button"
              onClick={() => setAuthMode((mode) => (mode === 'login' ? 'register' : 'login'))}
            >
              {authMode === 'login' ? 'Need an account?' : 'Already have an account?'}
            </button>
          </form>
          {error ? <p className="message error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>Ezlisten Admin</h1>
          <p>Signed in as {session.email}</p>
        </div>
        <button className="secondary" onClick={signOut}>
          Sign out
        </button>
      </section>

      {message ? <p className="message">{message}</p> : null}
      {error ? <p className="message error">{error}</p> : null}

      <section className="dashboard grid">
        <aside className="grid">
          <section className="panel">
            <h2>Upload Audio</h2>
            <form className="form-grid" onSubmit={uploadBook}>
              <label>
                Title
                <input name="title" required />
              </label>
              <label>
                Author
                <input name="author" required />
              </label>
              <label>
                Audio file
                <input name="audio" type="file" accept="audio/*" required />
              </label>
              <button disabled={isBusy}>Upload</button>
            </form>
          </section>

          <section className="panel">
            <h2>Library</h2>
            <div className="list">
              {books.map((book) => (
                <button
                  className={`list-item ${book._id === selectedBookId ? 'active' : ''}`}
                  key={book._id}
                  onClick={() => setSelectedBookId(book._id)}
                  type="button"
                >
                  <strong>{book.title}</strong>
                  <p className="muted">{book.author}</p>
                  <span className="pill">
                    {book.status} · {formatDuration(book.durationMs)}
                  </span>
                </button>
              ))}
              {books.length === 0 ? <p className="muted">No audio files yet.</p> : null}
            </div>
          </section>
        </aside>

        <section className="grid">
          {selectedBook ? (
            <>
              <section className="panel grid">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <h2>{selectedBook.title}</h2>
                    <p className="muted">Manage the metadata visible in the listening app.</p>
                  </div>
                  <button className="danger" onClick={deleteBook} type="button">
                    Delete book
                  </button>
                </div>
                <audio controls src={selectedBook.audioFileUrl} style={{ width: '100%' }} />
                <form className="form-grid" onSubmit={saveMetadata}>
                  <div className="split">
                    <label>
                      Title
                      <input
                        value={bookForm.title}
                        onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })}
                      />
                    </label>
                    <label>
                      Author
                      <input
                        value={bookForm.author}
                        onChange={(event) => setBookForm({ ...bookForm, author: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="split">
                    <label>
                      Duration seconds
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={bookForm.durationSeconds}
                        onChange={(event) =>
                          setBookForm({ ...bookForm, durationSeconds: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Status
                      <select
                        value={bookForm.status}
                        onChange={(event) =>
                          setBookForm({ ...bookForm, status: event.target.value as Audiobook['status'] })
                        }
                      >
                        <option value="uploaded">uploaded</option>
                        <option value="processing">processing</option>
                        <option value="ready">ready</option>
                        <option value="failed">failed</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Cover image URL
                    <input
                      value={bookForm.coverImageUrl}
                      onChange={(event) => setBookForm({ ...bookForm, coverImageUrl: event.target.value })}
                    />
                  </label>
                  <button disabled={isBusy}>Save metadata</button>
                </form>
              </section>

              <TranscriptEditor
                createSegment={createSegment}
                deleteSegment={deleteSegment}
                segments={segments}
                updateSegment={updateSegment}
              />

              <FilterTagEditor
                createFilterTag={createFilterTag}
                deleteFilterTag={deleteFilterTag}
                filterTags={filterTags}
                updateFilterTag={updateFilterTag}
              />
            </>
          ) : (
            <section className="panel">
              <h2>Select an audio file</h2>
              <p className="muted">Upload or select a title to manage its timestamps.</p>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}

function TranscriptEditor({
  createSegment,
  deleteSegment,
  segments,
  updateSegment,
}: {
  createSegment: (event: FormEvent<HTMLFormElement>) => void;
  deleteSegment: (segmentId: string) => void;
  segments: TranscriptSegment[];
  updateSegment: (event: FormEvent<HTMLFormElement>, segmentId: string) => void;
}) {
  return (
    <section className="panel grid">
      <h2>Transcript Timestamps</h2>
      <form className="form-grid" onSubmit={createSegment}>
        <div className="split">
          <label>
            Start seconds
            <input name="startSeconds" type="number" min="0" step="0.001" required />
          </label>
          <label>
            End seconds
            <input name="endSeconds" type="number" min="0" step="0.001" required />
          </label>
        </div>
        <label>
          Transcript text
          <textarea name="text" required />
        </label>
        <button>Add segment</button>
      </form>

      <div className="list">
        {segments.map((segment) => (
          <form className="list-item form-grid" key={segment._id} onSubmit={(event) => updateSegment(event, segment._id)}>
            <div className="split">
              <label>
                Start seconds
                <input name="startSeconds" type="number" min="0" step="0.001" defaultValue={msToSeconds(segment.startMs)} />
              </label>
              <label>
                End seconds
                <input name="endSeconds" type="number" min="0" step="0.001" defaultValue={msToSeconds(segment.endMs)} />
              </label>
            </div>
            <label>
              Text
              <textarea name="text" defaultValue={segment.text} />
            </label>
            <div className="row">
              <button>Save</button>
              <button className="danger" type="button" onClick={() => deleteSegment(segment._id)}>
                Delete
              </button>
            </div>
          </form>
        ))}
        {segments.length === 0 ? <p className="muted">No transcript segments yet.</p> : null}
      </div>
    </section>
  );
}

function FilterTagEditor({
  createFilterTag,
  deleteFilterTag,
  filterTags,
  updateFilterTag,
}: {
  createFilterTag: (event: FormEvent<HTMLFormElement>) => void;
  deleteFilterTag: (tagId: string) => void;
  filterTags: FilterTag[];
  updateFilterTag: (event: FormEvent<HTMLFormElement>, tagId: string) => void;
}) {
  return (
    <section className="panel grid">
      <h2>Filter Tags</h2>
      <form className="form-grid" onSubmit={createFilterTag}>
        <FilterTagFields />
        <button>Add filter tag</button>
      </form>

      <div className="list">
        {filterTags.map((tag) => (
          <form className="list-item form-grid" key={tag._id} onSubmit={(event) => updateFilterTag(event, tag._id)}>
            <FilterTagFields tag={tag} />
            <div className="row">
              <button>Save</button>
              <button className="danger" type="button" onClick={() => deleteFilterTag(tag._id)}>
                Delete
              </button>
            </div>
          </form>
        ))}
        {filterTags.length === 0 ? <p className="muted">No filter tags yet.</p> : null}
      </div>
    </section>
  );
}

function FilterTagFields({ tag }: { tag?: FilterTag }) {
  return (
    <>
      <div className="split">
        <label>
          Category
          <select name="category" defaultValue={tag?.category ?? 'profanity'}>
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          Action
          <select name="action" defaultValue={tag?.action ?? 'bleep'}>
            {ACTION_OPTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="split">
        <label>
          Start seconds
          <input name="startSeconds" type="number" min="0" step="0.001" defaultValue={tag ? msToSeconds(tag.startMs) : ''} required />
        </label>
        <label>
          End seconds
          <input name="endSeconds" type="number" min="0" step="0.001" defaultValue={tag ? msToSeconds(tag.endMs) : ''} required />
        </label>
      </div>
      <div className="split">
        <label>
          Severity
          <select name="severity" defaultValue={tag?.severity ?? 1}>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>
        <label>
          Original text
          <input name="originalText" defaultValue={tag?.originalText ?? ''} required />
        </label>
      </div>
      <label>
        Replacement text
        <input name="replacementText" defaultValue={tag?.replacementText ?? ''} />
      </label>
    </>
  );
}
