import Header from './components/Header';
import Hero from './components/Hero';
import Partners from './components/Partners';
import About from './components/About';
import Games from './components/Games';
import Advantages from './components/Advantages';
import Team from './components/Team';
import Footer from './components/Footer';

function App() {
    return (
        <div className="app">
            <Header />
            <main>
                <Hero />
                <Partners />
                <About />
                <Games />
                <Advantages />
                <Team />
            </main>
            <Footer />
        </div>
    );
}

export default App;
