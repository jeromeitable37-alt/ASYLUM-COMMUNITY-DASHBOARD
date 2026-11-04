import { useState } from 'react';
import { ArrowUpRight, Clapperboard, ExternalLink, Film, Play, Radio, ShieldCheck } from 'lucide-react';
import './cinematic-media.css';

const officialVideos = [
  {
    id: 'uxpYBPf1en0',
    title: '5 YEARS OF CODM',
    subtitle: 'Official Gameplay Trailer',
    details: 'A cinematic look back at Call of Duty: Mobile, its community, and years of gameplay.',
    release: 'CODM / 2024',
  },
  {
    id: 'mbJ5-LozpwU',
    title: 'AGAINST ALL FATE',
    subtitle: 'Season 8 Official Trailer',
    details: 'Explore the futuristic look and atmosphere of the official Season 8 trailer.',
    release: 'SEASON 08 / 2026',
  },
  {
    id: 'rIwSYKvzKfk',
    title: 'TERMINATED',
    subtitle: 'Season 7 Official Trailer',
    details: 'A sci-fi-inspired official CODM season trailer with cinematic environments.',
    release: 'SEASON 07 / 2026',
  },
] as const;

export default function CinematicMedia() {
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const current = officialVideos[selected];
  const thumbnail = (id: string) => 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
  const select = (index: number) => {
    setSelected(index);
    setPlaying(false);
  };
  return (
    <section className="asy-cinema" id="cinematic" aria-labelledby="asy-cinema-title">
      <div className="asy-cinema-intro">
        <div>
          <div className="asy-cinema-kicker"><span className="asy-cinema-led" /> 02 / IN THE GAME <span className="asy-cinema-divider">—</span> OFFICIAL CODM MEDIA</div>
          <h2 id="asy-cinema-title">FEEL THE <em>ENERGY.</em></h2>
          <p>From the game that connects our community: an official CODM video showcase. Choose a trailer to play in full quality without slowing down the homepage.</p>
        </div>
        <div className="asy-cinema-broadcast"><Radio size={20} /><span>COMMUNITY CINEMA <strong>03 FILMS</strong></span></div>
      </div>
      <div className="asy-cinema-layout">
        <div className="asy-cinema-stage">
          <div className="asy-cinema-stage-top"><span><span className="asy-cinema-led" /> NOW SELECTED</span><span>OFFICIAL CALL OF DUTY: MOBILE</span></div>
          <div className="asy-cinema-screen" id="asy-cinema-player">
            {playing ? (
              <iframe
                key={current.id}
                src={'https://www.youtube-nocookie.com/embed/' + current.id + '?autoplay=1&playsinline=1'}
                title={current.title + ' — official Call of Duty: Mobile video'}
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                className="asy-cinema-cover"
                onClick={() => setPlaying(true)}
                aria-label={'Play ' + current.title + ' on YouTube'}>
                <img src={thumbnail(current.id)} alt={current.subtitle + ' official thumbnail'} loading="lazy" />
                <span className="asy-cinema-play" aria-hidden="true"><Play size={29} fill="currentColor" /></span>
                <span className="asy-cinema-cover-prompt">CLICK TO PLAY THE OFFICIAL TRAILER</span>
              </button>
            )}
          </div>
          <div className="asy-cinema-stage-details">
            <span className="asy-cinema-video-symbol"><Clapperboard size={22} /></span>
            <div><span className="asy-cinema-meta">{current.release} / OFFICIAL VIDEO</span><h3>{current.title}</h3><p>{current.details}</p></div>
            <a href={'https://www.youtube.com/watch?v=' + current.id} target="_blank" rel="noopener noreferrer" aria-label={'Watch ' + current.title + ' on YouTube'}><ExternalLink size={21}/></a>
          </div>
        </div>
        <div className="asy-cinema-playlist" aria-label="Official CODM video selections">
          <div className="asy-cinema-playlist-header"><Film size={18}/><span>SELECT A FILM</span><strong>01—03</strong></div>
          {officialVideos.map((video, index) => (
            <button
              key={video.id}
              type="button"
              className={'asy-cinema-video-choice' + (selected === index ? ' selected' : '')}
              aria-pressed={selected === index}
              onClick={() => select(index)}>
              <span className="asy-cinema-thumb"><img src={thumbnail(video.id)} alt="" loading="lazy" /><span><Play size={15} fill="currentColor"/></span></span>
              <span className="asy-cinema-choice-info"><small>{video.release}</small><strong>{video.title}</strong><span>{video.subtitle}</span></span>
              <ArrowUpRight size={17} className="asy-cinema-choice-arrow" />
            </button>
          ))}
          <div className="asy-cinema-disclaimer"><ShieldCheck size={17}/><p>Videos are from the verified Call of Duty: Mobile channel. ASYLUM Community is an independent fan community; no gameplay footage is reuploaded or modified.</p></div>
        </div>
      </div>
    </section>
  );
}
