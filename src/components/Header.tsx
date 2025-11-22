import './Header.css';

const Header = () => {
    return (
        <header className="header">
            <nav className="nav container">
                <div className="nav-logo">
                    <img src="/images/Logo_v4.png" alt="DEXStudios" />
                </div>

                <ul className="nav-menu">
                    <li><a href="#home">Home</a></li>
                    <li><a href="#about">About Us</a></li>
                    <li><a href="#games">Games</a></li>
                    <li><a href="https://docs.openbisea.com/dexstudio/" target="_blank" rel="noopener noreferrer">WhitePaper</a></li>
                    <li><a href="https://docs.google.com/presentation/d/1hMu5Q1A5hMA8W8xXF_oB5Sbw8qeLSKRI5luZAvxkuec/edit?usp=sharing" target="_blank" rel="noopener noreferrer">PitchDeck</a></li>
                    <li><a href="#contact">Contact</a></li>

                </ul>

                <a href="https://t.me/alex12alex" target="_blank" rel="noopener noreferrer" className="btn btn-primary">Partner with us</a>

                <button className="nav-toggle" aria-label="Toggle navigation">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
            </nav>
        </header>
    );
};

export default Header;
