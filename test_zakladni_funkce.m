%% Test – základní funkce MatCalc
% Projde základní výpočty, funkce, jednotky a grafy.
% Řádky bez středníku vypíšou výsledek, v komentáři je očekávaná hodnota.
% ⌥↵ spustí jen sekci s kurzorem, ⌘↵ celý skript.

%% Základy a konstanty
a = 3;
b = 4;
c = sqrt(a^2 + b^2)          % 5
d = hypot(a, b)              % 5
p = pi                       % 3.1416
e1 = exp(1)                  % 2.7183
podil = 7 / 2                % 3.5
zbytek = mod(17, 5)          % 2
zaokr = round(pi, 3)         % 3.142
dolu = floor(-2.5)           % -3
nahoru = ceil(-2.5)          % -2
k_nule = fix(-2.5)           % -2

%% Vektory a indexování
t = 0:0.5:3                  % [0, 0.5, …, 3]
x = linspace(0, 10, 5)       % [0, 2.5, 5, 7.5, 10]
v = [4 1 3 2];
v(2)                         % 1
v(end)                       % 2
v(2:end)                     % [1, 3, 2]
n = length(x)                % 5
sz = size([1 2; 3 4])        % [2, 2]
y = x.^2;                    % prvková mocnina
z = x .* y;                  % prvkové násobení
w = 1 ./ (1 + x);            % prvkové dělení

%% Goniometrie
s30 = sind(30)               % 0.5
c60 = cosd(60)               % 0.5
uhel = atan2(1, 1)           % 0.7854 (= pi/4)
deg = rad2deg(pi/4)          % 45
rad = deg2rad(180)           % 3.1416
sin_vektor = sin([0 pi/2 pi]);

%% Exponenciála a logaritmy
ln10 = log(10)               % 2.3026
log10_1000 = log10(1000)     % 3
log2_8 = log2(8)             % 3
T12 = 15;                    % poločas [h]
lam = log(2) / T12           % 0.046210
zbyva_po_30h = exp(-lam * 30)  % 0.25

%% Statistika
data = [2 4 4 4 5 5 7 9];
soucet = sum(data)           % 40
prumer = mean(data)          % 5
med = median(data)           % 4.5
odchylka = std(data)         % 2.1381
nejmensi = min(data)         % 2
nejvetsi = max(data)         % 9
serazeno = sort([3 1 2])     % [1, 2, 3]
prubezne = cumsum([1 2 3 4]) % [1, 3, 6, 10]
rozdily = diff([1 4 9 16])   % [3, 5, 7]
efektivni = rms([1 -1 1 -1]) % 1

%% Vlastní funkce
f(x) = x.^2 + 1
f(3)                         % 10
g(a, b) = sqrt(a^2 + b^2)
g(6, 8)                      % 10
hodnoty_f = f([0 1 2])       % [1, 2, 5]

%% Polynomy, interpolace, integrál
xp = [0 1 2 3 4];
yp = 2*xp.^2 - 3*xp + 1;
koef = polyfit(xp, yp, 2)    % [2, -3, 1]
yp_5 = polyval(koef, 5)      % 36
mezi = interp1([0 10], [0 100], 2.5)   % 25
plocha = trapz(xp, xp)       % 8 (integrál x od 0 do 4)

%% Matice
M = [2 1; 1 3]
detM = det(M)                % 5
invM = inv(M)
I2 = eye(2)
rhs = [3; 5];
reseni = inv(M) * rhs        % [0.8; 1.4]
nuly = zeros(2, 3)
jednicky = ones(1, 4)
skal = dot([1 2 3], [4 5 6]) % 32

%% Komplexní čísla
zc = 3 + 4i
modul = abs(zc)              % 5
faze_deg = rad2deg(angle(zc))  % 53.13
re = real(zc)                % 3
im = imag(zc)                % 4
sdruzene = conj(zc)          % 3 - 4i

%% Jednotky
U = 230 V;
I = 10 A;
P = U * I to kW              % 2.3 kW
L = 12 km;
cas = L / (60 km/h) to minute   % 12 minute
R = 0.306 ohm/km * L         % 3.672 ohm

%% Výpis
disp('Text přes disp')
disp(c)
fprintf('c = %.2f, prumer = %g\n', c, prumer)
fprintf('Vektor: %d %d %d\n', [1 2 3])
txt = num2str(pi, 4)         % "3.142"
s = sprintf('%d%%', 50)      % "50%"
format long
pi
format short
pi

%% Grafy
tg = linspace(0, 2*pi, 100);
sinus = sin(tg);
kosinus = cos(tg);
td = 0:5:60;
rozpad = exp(-lam * td);
xl = logspace(-1, 2, 20);
yl = xl.^-1.5;

figure
plot(tg, sinus, 'LineWidth', 1.5, 'DisplayName', 'sin')
hold on
plot(tg, kosinus, 'r--', 'DisplayName', 'cos')
title('Goniometrické funkce')
xlabel('\phi [rad]')
ylabel('hodnota [-]')
legend('Location', 'southwest')
grid on
xlim([0 2*pi])

figure('Name', 'Rozpad')
semilogy(td, rozpad, '-o', 'MarkerFaceColor', 'b')
title('Rozpad, T_{1/2} = 15 h')
xlabel('t [h]')
ylabel('N / N_0 [-]')
grid on

figure
loglog(xl, yl, 'k-s', 'MarkerSize', 4)
title('Mocninná závislost y = x^{-1.5}')
xlabel('x [-]')
ylabel('y [-]')
grid on
grid minor
axis tight
