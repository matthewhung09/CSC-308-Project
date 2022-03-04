import { useState, React } from "react";
import styled from "styled-components";
import { Button, StylesProvider } from "@material-ui/core";
import Popup from "reactjs-popup";
import "../../App.css";
import "../SpotifyLogin/SpotifyLogin.css";
import { useNavigate } from "react-router-dom";

const AUTH_URL =
    "https://accounts.spotify.com/authorize?client_id=31aab7d48ba247f2b055c23b5ac155d8&response_type=code&redirect_uri=http://localhost:3000/home&scope=streaming%20user-read-email%20user-read-private%20user-library-read%20user-library-modify%20user-read-playback-state%20user-modify-playback-state";

const PopupWrapper = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    width: 85%;
`;

const PopupTitle = styled.h1`
    font-style: normal;
    font-weight: bold;
    font-size: 30px;
    color: black;
    text-align: center;
    max-width: 85%;
    margin-top: 12px;
    margin-bottom: 10px;
`;

const StyledButton = styled(Button)`
    background-color: black;
    padding: 8px;
    border-radius: none;
    text-transform: uppercase;
    margin-top: 10px;
    letter-spacing: 1.6px;
    font-size: 12px;
    font-weight: 600;
    width: 100%;
    cursor: pointer;
`;

function SpotifyLogin() {
    let navigate = useNavigate();

    // sets popup to be open when page is first loaded
    const [open, setOpen] = useState(true);
    const closeModal = () => setOpen(false);

    return (
        <StylesProvider injectFirst>
            <Popup open={open} closeOnDocumentClick={false} onClose={closeModal}>
                {(close) => (
                    <div className="modal">
                        <button className="close" onClick={close}>
                            &times;
                        </button>
                        <PopupWrapper>
                            <PopupTitle> Connect with spotify </PopupTitle>
                            <div className="login-button">
                                <a href={AUTH_URL}>LOGIN WITH SPOTIFY</a>
                            </div>
                            <div className="actions">
                                <StyledButton
                                    fullWidth
                                    type="submit"
                                    variant="contained"
                                    color="primary"
                                    onClick={() => navigate("/signup")}
                                >
                                    Go Back
                                </StyledButton>
                                <StyledButton
                                    fullWidth
                                    type="submit"
                                    variant="contained"
                                    color="primary"
                                    onClick={() => window.location.assign("/home")}
                                    // onClick={() => navigate("/home")}
                                >
                                    Continue
                                </StyledButton>
                            </div>
                        </PopupWrapper>
                    </div>
                )}
            </Popup>
        </StylesProvider>
    );
}

export default SpotifyLogin;
