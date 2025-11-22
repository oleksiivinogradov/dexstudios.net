import './Footer.css';

const Footer = () => {
    return (
        <footer id="contact" className="footer">
            <div className="container">
                <div className="footer-content">
                    <div className="footer-section">
                        <h3 className="gradient-text">DEXStudios</h3>
                        <p>Full cycle Web3 Game Studios</p>
                        <div className="footer-social">
                            <a href="#" aria-label="Twitter">🐦</a>
                            <a href="#" aria-label="Discord">💬</a>
                            <a href="#" aria-label="Telegram">✈️</a>
                        </div>
                    </div>

                    <div className="footer-section">
                        <h4>Quick Links</h4>
                        <ul>
                            <li><a href="#home">Home</a></li>
                            <li><a href="#about">About Us</a></li>
                            <li><a href="#games">Games</a></li>
                            <li><a href="https://docs.openbisea.com/dexstudio/" target="_blank" rel="noopener noreferrer">WhitePaper</a></li>
                        </ul>
                    </div>

                    <div className="footer-section">
                        <h4>Products</h4>
                        <ul>
                            <li><a href="https://www.dexgo.club/en" target="_blank" rel="noopener noreferrer">DexGO</a></li>
                            <li><a href="https://motodex.dexstudios.games" target="_blank" rel="noopener noreferrer">MotoDEX</a></li>
                            <li><a href="#games">SeaBattle VR</a></li>
                        </ul>
                    </div>

                    <div className="footer-section">
                        <h4>Contact</h4>
                        <p>For Any Assistance Required Please Reach Out</p>
                        <a href="mailto:alex@dexstudios.net" className="footer-email">alex@dexstudios.net</a>
                    </div>
                </div>

                <div className="footer-bottom">
                    <p>© 2024 by DEXStudios. Powered and secured.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
