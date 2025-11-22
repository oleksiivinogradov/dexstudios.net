import './Hero.css';

const Hero = () => {
    return (
        <section id="home" className="hero">
            <div className="hero-background">
                <div className="hero-gradient"></div>
                <div className="hero-particles"></div>
            </div>

            <div className="hero-content container">
                <div className="hero-left animate-slide-in-left">
                    <div className="hero-logo">
                        <img src="/images/Logo_v3.png" alt="DEXStudios Logo" />
                    </div>
                    <h1>Play Web3 games.<br />Create anything.<br />Earn Bitcoin and have fun.</h1>
                    <p className="hero-subtitle">
                        Immerse yourself in the dynamic Ecosystem of DEXStudios, a convergence of innovation and entertainment.
                    </p>
                    <div className="hero-cta">
                        <a href="mailto:alex@openbisea.com?subject=Partnership with DEXStudios" className="btn btn-primary">
                            Partner with us
                        </a>
                        <a href="https://docs.openbisea.com/dexstudio/" className="btn btn-secondary" target="_blank" rel="noopener noreferrer">
                            Read more
                        </a>
                    </div>
                </div>

                <div className="hero-right animate-slide-in-right">
                    <div className="hero-devices">
                        <img src="/images/Phone_v6.png" alt="DexGO Mobile App" className="hero-phone" />
                        <img src="/images/Tablet_v4.png" alt="DexGO Tablet App" className="hero-tablet" />
                    </div>
                </div>
            </div>

            <div className="hero-scroll">
                <span>Scroll to explore</span>
                <div className="scroll-indicator"></div>
            </div>
        </section>
    );
};

export default Hero;
