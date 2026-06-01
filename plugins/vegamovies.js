(function() {

const HEADERS = { "User-Agent": "Mozilla/5.0" };

const DOMAINS = [
    "https://vegamovies.rs",
    "https://vegamovies.nl",
    "https://vegamovies.pm"
];

async function fetchWithFallback(path = "") {
    for (const base of DOMAINS) {
        try {
            const res = await http_get(base + path);
            if (res.body) return res;
        } catch {}
    }
    throw new Error("All domains failed");
}

function extractQuality(text) {
    const q = ["4k", "2160p", "1080p", "720p", "480p"];
    for (const i of q) if ((text || "").toLowerCase().includes(i)) return i;
    return "";
}

function cleanLinks(arr) {
    const seen = new Set();
    return arr.filter(x => {
        if (!x.url || seen.has(x.url)) return false;
        seen.add(x.url);
        return true;
    });
}

async function safeBypass(link) {
    try {
        const res = await http_get(link);
        const m = res.body.match(/link":"([^"]+)"/);
        if (m) {
            let enc = m[1].replace(/\\\//g, "/");
            while (enc.length % 4 !== 0) enc += '=';
            return atob(enc);
        }
    } catch {}
    return link;
}

async function extractGDFlix(url, streams) {
    try {
        const res = await http_get(url);
        const doc = await parseHtml(res.body);

        const anchors = Array.from(doc.querySelectorAll('a'));

        for (const a of anchors) {
            const href = a.href;
            const text = a.textContent || "";

            if (!href) continue;

            const quality = extractQuality(text);
            const tag = quality ? ` [${quality}]` : "";

            if (href.includes("pixeldrain")) {
                const id = href.split('/').pop();
                streams.push(new StreamResult({
                    url: `https://pixeldrain.com/api/file/${id}?download`,
                    source: `PixelDrain${tag}`,
                    headers: HEADERS
                }));
            } else {
                streams.push(new StreamResult({
                    url: href,
                    source: `GDFlix${tag}`,
                    headers: HEADERS
                }));
            }
        }
    } catch {}
}

async function processLink(link, quality, streams) {
    if (link.includes("gdflix") || link.includes("fastdl")) {
        await extractGDFlix(link, streams);
    } else {
        streams.push(new StreamResult({
            url: link,
            source: `VegaMovies [${quality}]`,
            headers: HEADERS
        }));
    }
}

function toItem(el) {
    const a = el.querySelector('a');
    if (!a) return null;

    return new MultimediaItem({
        title: a.title || a.textContent,
        url: a.href,
        posterUrl: el.querySelector('img')?.src || "",
        type: "movie"
    });
}

async function getHome(cb) {
    try {
        const res = await fetchWithFallback();
        const doc = await parseHtml(res.body);

        const items = Array.from(doc.querySelectorAll('article'))
            .map(toItem).filter(Boolean);

        cb({ success: true, data: { "Home": items } });
    } catch (e) {
        cb({ success: false });
    }
}

async function search(query, cb) {
    try {
        const res = await fetchWithFallback(`/?s=${encodeURIComponent(query)}`);
        const doc = await parseHtml(res.body);

        const items = Array.from(doc.querySelectorAll('article'))
            .map(toItem).filter(Boolean);

        cb({ success: true, data: items });
    } catch {
        cb({ success: false });
    }
}

async function load(url, cb) {
    try {
        const res = await http_get(url);
        const doc = await parseHtml(res.body);

        const links = [];

        const anchors = Array.from(doc.querySelectorAll('a'))
            .filter(a => a.href && a.textContent.toLowerCase().includes("download"));

        for (const a of anchors) {
            let link = a.href;
            const quality = extractQuality(a.textContent);

            if (link.includes("id=")) {
                link = await safeBypass(link);
            }

            links.push({ url: link, quality });
        }

        const cleaned = cleanLinks(links);

        cb({
            success: true,
            data: {
                title: doc.title,
                url: url,
                posterUrl: doc.querySelector('img')?.src || "",
                type: "movie",
                episodes: [{
                    name: "Play",
                    url: JSON.stringify(cleaned),
                    season: 1,
                    episode: 1
                }]
            }
        });

    } catch {
        cb({ success: false });
    }
}

async function loadStreams(url, cb) {
    const streams = [];
    const parsed = JSON.parse(url);

    for (const item of parsed) {
        await processLink(item.url, item.quality, streams);
    }

    cb({ success: true, data: streams });
}

globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;

})();
